data "aws_iam_policy_document" "ecs_task_execution_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Standard ECS "execution role": what the ECS agent itself assumes to pull
# the container image and write logs on the task's behalf. This is
# distinct from the Cloudsentry "task role" (infra/terraform/iam) — the
# task role is what the RUNNING APPLICATION CODE assumes to call AWS
# APIs (CloudWatch, Cost Explorer, etc.); the execution role never
# touches application-level AWS calls. Every ECS Fargate task needs
# both.
resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "cloudsentry-ecs-execution-role-${var.environment_name}"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "cloudsentry/${var.environment_name}/anthropic-api-key"
  description = "Anthropic API key for Cloudsentry's agent swarm. Terraform only creates this secret container — populate its value manually (e.g. `aws secretsmanager put-secret-value`), never via Terraform state or source control."
}

resource "aws_iam_role_policy" "ecs_task_execution_read_secret" {
  name = "cloudsentry-read-anthropic-secret"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.anthropic_api_key.arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/cloudsentry/${var.environment_name}/backend"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "cloudsentry" {
  name = "cloudsentry-${var.environment_name}"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "cloudsentry-backend-${var.environment_name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = var.cloudsentry_task_role_arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.container_image
      essential = true
      portMappings = [
        { containerPort = 8000, protocol = "tcp" }
      ]
      environment = [
        { name = "AWS_DEFAULT_REGION", value = var.aws_region }
      ]
      secrets = [
        {
          name      = "ANTHROPIC_API_KEY"
          valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])
}

resource "aws_security_group" "backend" {
  name        = "cloudsentry-backend-${var.environment_name}"
  description = "Cloudsentry backend ECS task security group"
  vpc_id      = var.vpc_id

  egress {
    description = "Allow all outbound (AWS APIs, Anthropic API)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# No Application Load Balancer or public subnet routing in this scope —
# deferred item: add an ALB + public networking before treating this as
# a real public deployment. The service runs without a reachable public
# endpoint; reaching it requires VPC-internal access (e.g. a bastion or
# VPN), a manual operational step outside this Terraform.
resource "aws_ecs_service" "backend" {
  name            = "cloudsentry-backend-${var.environment_name}"
  cluster         = aws_ecs_cluster.cloudsentry.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }
}
