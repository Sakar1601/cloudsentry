variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
}

variable "environment_name" {
  description = "Logical environment name, used in resource naming."
  type        = string
  default     = "dev"
}

variable "container_image" {
  description = "Full image URI (e.g. an ECR repository URI:tag) for the backend container, built via backend/Dockerfile. Pushing it to a registry is a manual step this Terraform does not perform."
  type        = string
}

variable "cloudsentry_task_role_arn" {
  description = "ARN of the Cloudsentry execution (task) role, from infra/terraform/iam's execution_role_arn output."
  type        = string
}

variable "vpc_id" {
  description = "VPC to deploy the ECS service into. This Terraform does not create a VPC — supply an existing one (e.g. the account's default VPC)."
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the ECS service's network configuration (private subnets recommended, since assign_public_ip is false)."
  type        = list(string)
}
