variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID owning the Workers and D1 database."
}

variable "domain" {
  type        = string
  description = "Root domain that fronts the application (e.g. example.com). Used for the web Worker custom domain."
}

variable "zone_id" {
  type        = string
  description = "Cloudflare zone ID for `domain`."
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Worker environment name. Matches `wrangler deploy --env <environment>` for env-namespaced configs."
}
