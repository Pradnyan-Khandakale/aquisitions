output "namespace_name" {
  description = "Name of the created Kubernetes namespace"
  value       = kubernetes_namespace.acquisitions.metadata[0].name
}

output "configmap_name" {
  description = "Name of the created baseline ConfigMap"
  value       = kubernetes_config_map.acquisitions_config.metadata[0].name
}
