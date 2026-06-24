# Terraform Infrastructure Setup

This guide walks you through setting up the AWS CLI from scratch so you can use Terraform to manage infrastructure for the Nutritionell project.

## Prerequisites

- An AWS account with IAM user credentials (access key ID + secret access key)
- macOS, Linux, or Windows with a terminal
- Terraform >= 1.6 installed ([install guide](https://developer.hashicorp.com/terraform/install))

## 1. Install the AWS CLI

**macOS (Homebrew):**

```bash
brew install awscli
```

**Linux:**

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:**

Download and run the MSI installer from https://aws.amazon.com/cli/.

Verify the installation:

```bash
aws --version
```

## 2. Configure AWS CLI Credentials

Run the interactive configuration command:

```bash
aws configure
```

You will be prompted for four values:

```
AWS Access Key ID [None]: <your-access-key-id>
AWS Secret Access Key [None]: <your-secret-access-key>
Default region name [None]: us-east-1
Default output format [None]: json
```

This creates two files under `~/.aws/`:

### `~/.aws/credentials` -- Who You Are

This file stores your **secrets**: access key ID and secret access key. These are the authentication tokens that prove your identity to AWS.

```ini
[default]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
```

- Each section (e.g., `[default]`, `[vscode]`) is a **named profile**.
- The `[default]` profile is used when no `--profile` flag is passed.
- **Never commit this file to version control.** Treat it like a password.

### `~/.aws/config` -- How You Connect

This file stores **non-secret settings**: region, output format, SSO configuration, and role assumptions.

```ini
[default]
region = us-east-1
output = json
```

- Settings here control *where* and *how* requests are made, not *who* makes them.
- Can be safely shared or documented (it contains no secrets).

### Why Both Files Matter for Terraform

Terraform's AWS provider reads **both** files to authenticate and configure API calls. Without valid credentials, `terraform plan` and `terraform apply` will fail with `NoCredentialProviders`. Without a region in config, every resource definition would need an explicit region.

## 3. Working with Named Profiles

If you have multiple AWS accounts or roles, create additional profiles:

```bash
aws configure --profile <profile-name>
```

### Profile Name Matching Between Files

The profile names must match between credentials and config, but the syntax differs slightly:

| File | Default profile | Named profile |
|---|---|---|
| `~/.aws/credentials` | `[default]` | `[YushengTestOnPri]` |
| `~/.aws/config` | `[default]` | `[profile YushengTestOnPri]` |

Notice that `config` requires the `profile` prefix, while `credentials` does not.

If the names don't match, AWS CLI won't associate the credentials with the config settings. For example, if you have `[YushengTestOnPri]` in credentials but no `[profile YushengTestOnPri]` in config, the profile will still work — it just won't have a region or output format set, and you'd need to pass `--region` manually.

### Switching Profiles

To use a named profile with Terraform, set the `AWS_PROFILE` environment variable:

```bash
export AWS_PROFILE=<profile-name>
```

Or pass it per-command for one-off checks:

```bash
aws s3 ls --profile <profile-name>
```

To switch back to the default profile, unset the variable:

```bash
unset AWS_PROFILE
```

### Default Profile Behavior

If you don't set `AWS_PROFILE`, the CLI **always falls back to `[default]`** automatically. You only need to set it explicitly when you want to use a non-default profile.

| Scenario | What happens |
|---|---|
| `AWS_PROFILE` not set | Uses `[default]` from credentials/config |
| `export AWS_PROFILE=<profile-name>` | Uses that profile for the entire terminal session |
| `aws s3 ls --profile <profile-name>` | Uses that profile for that one command only |

If `[default]` is the profile you use most often, you never need to touch `AWS_PROFILE` for day-to-day work.

## 4. Verify Your Setup

Confirm your identity and that credentials are working:

```bash
aws sts get-caller-identity
```

Expected output:

```json
{
    "UserId": "AIDA...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/YourUserName"
}
```

Check that the correct region is set:

```bash
aws configure get region
```

## 5. Initialize and Run Terraform

Once AWS CLI is configured, you can initialize and use Terraform:

```bash
# Navigate to the terraform directory
cd infra/terraform

# Download provider plugins and initialize the backend
terraform init

# Preview what resources will be created/changed
terraform plan

# Apply the changes (will prompt for confirmation)
terraform apply

# View current state of managed resources
terraform state list

# Tear down all managed resources (use with caution)
terraform destroy
```

## 6. Useful AWS CLI Commands for Debugging

```bash
# Check which profile is active
echo $AWS_PROFILE

# List all configured profiles
aws configure list-profiles

# Show the full configuration for the active profile
aws configure list

# Test S3 access (quick sanity check)
aws s3 ls

# Check IAM permissions attached to your user
aws iam list-attached-user-policies --user-name <your-username>
```

## Notes

- This project uses **us-east-1** as the default region (see `variables.tf`).
- Sensitive variables like `gemini_api_key` should be passed via `TF_VAR_gemini_api_key` environment variable or a `terraform.tfvars` file that is **not committed** to version control.
- The Terraform state file (`terraform.tfstate`) contains sensitive data. If working in a team, consider enabling the S3 backend (see `versions.tf` for the commented-out configuration).
