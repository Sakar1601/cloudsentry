output "execution_role_arn" {
  description = "ARN of the Cloudsentry execution (task) role."
  value       = aws_iam_role.cloudsentry_execution_role.arn
}

output "execution_role_name" {
  description = "Name of the Cloudsentry execution (task) role."
  value       = aws_iam_role.cloudsentry_execution_role.name
}
