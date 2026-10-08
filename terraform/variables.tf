variable "kubeconfig_path" {
  description = "Path to the kubeconfig file (defaults to ~/.kube/config)"
  type        = string
  default     = "~/.kube/config"
}

variable "kubeconfig_context" {
  description = "Context to use in the kubeconfig file"
  type        = string
  default     = "minikube"
}

variable "namespace" {
  description = "Kubernetes namespace for the acquisitions workloads"
  type        = string
  default     = "acquisitions"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "production"
}

variable "cors_origin" {
  description = "Allowed CORS origin for the API"
  type        = string
  default     = "https://app.example.com"
}

variable "log_level" {
  description = "Logging level"
  type        = string
  default     = "info"
}
