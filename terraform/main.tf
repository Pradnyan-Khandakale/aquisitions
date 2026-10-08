provider "kubernetes" {
  config_path    = pathexpand(var.kubeconfig_path)
  config_context = var.kubeconfig_context
}

resource "kubernetes_namespace" "acquisitions" {
  metadata {
    name = var.namespace

    labels = {
      "app.kubernetes.io/name"       = "acquisitions-api"
      "app.kubernetes.io/part-of"    = "acquisitions"
      "app.kubernetes.io/managed-by" = "terraform"
      "environment"                  = var.environment
    }
  }
}

resource "kubernetes_config_map" "acquisitions_config" {
  metadata {
    name      = "acquisitions-config"
    namespace = kubernetes_namespace.acquisitions.metadata[0].name

    labels = {
      "app.kubernetes.io/name"       = "acquisitions-api"
      "app.kubernetes.io/part-of"    = "acquisitions"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  data = {
    NODE_ENV    = var.environment
    PORT        = "3000"
    LOG_LEVEL   = var.log_level
    CORS_ORIGIN = var.cors_origin
  }
}
