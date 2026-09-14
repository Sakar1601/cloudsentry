output "ecs_cluster_name" {
  value = aws_ecs_cluster.cloudsentry.name
}

output "ecs_service_name" {
  value = aws_ecs_service.backend.name
}

output "backend_log_group" {
  value = aws_cloudwatch_log_group.backend.name
}

output "anthropic_api_key_secret_arn" {
  description = "ARN of the Secrets Manager secret — populate its value manually before the service can start successfully."
  value       = aws_secretsmanager_secret.anthropic_api_key.arn
}
