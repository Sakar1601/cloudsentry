variable "aws_region" {
  description = "AWS region Cloudsentry operates in."
  type        = string
}

variable "environment_name" {
  description = "Logical environment name, used in resource naming."
  type        = string
  default     = "dev"
}
