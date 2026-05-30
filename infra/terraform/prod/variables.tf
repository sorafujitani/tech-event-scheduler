variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID owning the Workers and D1 database."
}

variable "domain" {
  type        = string
  default     = ""
  description = "Root domain that fronts the application (e.g. example.com). Leave empty to deploy on *.workers.dev."
}

variable "zone_id" {
  type        = string
  default     = ""
  description = "Cloudflare zone ID for `domain`. Required when attach_custom_domain = true."
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Worker environment name. Matches `wrangler deploy --env <environment>` for env-namespaced configs."
}

# Two-stage apply gate. The custom domain attaches a hostname to an existing
# Worker service, so the Worker must be deployed (via `wrangler deploy`) before
# we flip this to true. Workflow:
#   1. terraform apply  (with attach_custom_domain = false)  -> creates D1
#   2. take d1_database_id, paste into apps/api/wrangler.jsonc, wrangler deploy api/web
#   3. terraform apply -var attach_custom_domain=true        -> binds domain
variable "attach_custom_domain" {
  type        = bool
  default     = false
  description = "Set true only after both Worker scripts have been deployed via wrangler."

  validation {
    condition     = var.attach_custom_domain == false || (var.domain != "" && var.zone_id != "")
    error_message = "When attach_custom_domain = true, both domain and zone_id must be provided."
  }
}
