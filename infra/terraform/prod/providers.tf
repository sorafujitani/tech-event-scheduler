terraform {
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State backend = Cloudflare R2 (S3-compat).
  #
  # Bootstrap (one-time, manual — chicken/egg avoidance):
  #   1. Create the R2 bucket via wrangler:
  #        wrangler r2 bucket create tech-event-scheduler-tfstate
  #   2. Create an R2 API token (Cloudflare dashboard → R2 → Manage R2 API Tokens):
  #        Permission:  Object Read & Write
  #        Resource:    Specific bucket → tech-event-scheduler-tfstate
  #   3. Export the credentials and the R2 endpoint as env vars before running
  #      `terraform init`:
  #        export AWS_ACCESS_KEY_ID=<r2 access key id>
  #        export AWS_SECRET_ACCESS_KEY=<r2 secret access key>
  #        export AWS_ENDPOINT_URL_S3=https://<account-id>.r2.cloudflarestorage.com
  #   4. Also export the Cloudflare API token used by the provider:
  #        export CLOUDFLARE_API_TOKEN=<api token>
  #   5. Run:
  #        terraform init
  backend "s3" {
    bucket = "tech-event-scheduler-tfstate"
    key    = "prod/terraform.tfstate"
    region = "auto"

    # R2 specifics: tell the s3 backend to skip AWS-only behaviors.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

provider "cloudflare" {
  # api_token is read from CLOUDFLARE_API_TOKEN env var.
}
