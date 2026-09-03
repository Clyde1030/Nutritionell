# AWS setup — login / accounts feature

Everything AWS-side that the accounts feature needs, in the order it needs to
happen. Run these by hand; **none of it is Terraform**, and none of it was
executed for you.

## Why this is a runbook and not Terraform

The repo manages infrastructure in `infra/terraform/`, and normally SES
identities and IAM policies would live there too. For this feature they
deliberately don't: the steps below are one-time account-level operations (a
domain verification, a support ticket for sandbox exit, a secret value that must
never sit in version control), and doing them by hand keeps the secret out of
state files and avoids a `terraform apply` blocking on a support ticket.

**The one drift risk to understand** is step 2. You will add DNS records to a
Route53 zone that Terraform reads but does not own — `infra/terraform/dns.tf`
uses a `data "aws_route53_zone" "site"` lookup, not a `resource`, so Terraform
never enumerates or deletes records it didn't create. Adding records by hand to
that zone is therefore safe and will survive `terraform apply`. **Do not** add
them by editing `dns.tf`.

Assumed throughout:

- Region **`us-east-1`** (matches `variables.tf`'s `aws_region` default).
- Resource prefix **`nutritionell`** (matches `variables.tf`'s `name_prefix`).
- You have AWS CLI v2 configured with credentials that can administer this
  account. Check with `aws sts get-caller-identity`.

Set these once per shell so the commands below can be pasted as-is:

```bash
export AWS_REGION=us-east-1
export DOMAIN=nutritionell.com
export PREFIX=nutritionell
```

---

## 1. Verify the `nutritionell.com` domain identity in SES + enable DKIM

**Choice made here: verify the apex domain `nutritionell.com`, not a
`mail.` subdomain.** The apex lets you send as `no-reply@nutritionell.com`, which
is what `app/config.py`'s `ses_from_address` defaults to and what users expect to
see. A subdomain would mean `no-reply@mail.nutritionell.com` and a config change.
Pick one and stay with it — mixing them is how you end up with a "from" address
that isn't actually verified.

Create the identity with DKIM signing (Easy DKIM, 2048-bit):

```bash
aws sesv2 create-email-identity \
  --region "$AWS_REGION" \
  --email-identity "$DOMAIN" \
  --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT
```

Now read back the DNS records SES wants you to publish:

```bash
aws sesv2 get-email-identity \
  --region "$AWS_REGION" \
  --email-identity "$DOMAIN" \
  --query 'DkimAttributes.Tokens' --output text
```

That prints **three** DKIM tokens. Each becomes a CNAME record (step 2).

> If `create-email-identity` says the identity already exists, that's fine — skip
> straight to `get-email-identity`.

---

## 2. Publish the DKIM CNAME records in Route53

Find the hosted zone id for the domain:

```bash
aws route53 list-hosted-zones-by-name \
  --dns-name "$DOMAIN" \
  --query 'HostedZones[0].[Id,Name]' --output text
```

That returns something like `/hostedzone/Z0123456789ABCDEFGHIJ	nutritionell.com.`
Take the part after `/hostedzone/`:

```bash
export ZONE_ID=Z0123456789ABCDEFGHIJ   # ← paste yours
```

For each of the three tokens from step 1, you need a CNAME:

| Record name | Type | Value |
| --- | --- | --- |
| `<token>._domainkey.nutritionell.com` | CNAME | `<token>.dkim.amazonses.com` |

This script builds and submits all three in one change batch. Paste the three
tokens into `TOKENS` first:

```bash
TOKENS="token1 token2 token3"   # ← paste the three values from step 1

CHANGES=$(for t in $TOKENS; do
  cat <<EOF
{"Action":"UPSERT","ResourceRecordSet":{
  "Name":"${t}._domainkey.${DOMAIN}",
  "Type":"CNAME","TTL":1800,
  "ResourceRecords":[{"Value":"${t}.dkim.amazonses.com"}]}},
EOF
done | sed '$ s/,$//')

aws route53 change-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --change-batch "{\"Comment\":\"SES DKIM for login feature\",\"Changes\":[${CHANGES}]}"
```

`UPSERT` makes this safe to re-run.

**Console alternative:** Route53 → Hosted zones → `nutritionell.com` → *Create
record* → three times, one per token, Type `CNAME`, TTL 1800.

Verification is asynchronous. Poll until it flips to `SUCCESS` (usually minutes,
can take up to 72 hours if DNS is slow to propagate):

```bash
aws sesv2 get-email-identity --region "$AWS_REGION" --email-identity "$DOMAIN" \
  --query '{Verified:VerifiedForSendingStatus,DKIM:DkimAttributes.Status}'
```

Do not move on until `Verified` is `true`. Nothing will send before then.

### A note on drift

These records are invisible to Terraform, by design — see the top of this
document. Adding them here does not conflict with `terraform apply`. Do **not**
transcribe them into `dns.tf` "to be tidy": that would make Terraform start
managing records SES created, and a future `destroy` would silently break email.

---

## 3. Request SES production access (exit the sandbox)

New AWS accounts start in the **SES sandbox**, which means:

- you can only send **to** addresses/domains you have separately verified,
- the sending quota is very low (200 messages/day, 1/sec),
- everything else works normally, so it's easy to miss.

**Until this is approved, password reset emails will only arrive for test
addresses you have explicitly verified.** A real user hitting "forgot password"
will get the normal 200 response and no email — the API deliberately can't tell
them the difference (that's the anti-enumeration behaviour), so this will look
like silence rather than an error.

Request production access:

```bash
aws sesv2 put-account-details \
  --region "$AWS_REGION" \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://app.$DOMAIN" \
  --use-case-description "Transactional password-reset emails for account holders of the Nutritionell grocery-scanning web app. Recipients are users who have registered an account and explicitly requested a password reset. Low volume, no marketing email." \
  --contact-language EN
```

This opens an AWS Support case. Typical turnaround is under 24 hours. Check
status with:

```bash
aws sesv2 get-account --region "$AWS_REGION" --query 'ProductionAccessEnabled'
```

**To test before approval**, verify one address you control and send only to it:

```bash
aws sesv2 create-email-identity --region "$AWS_REGION" --email-identity you@yourmail.com
# then click the link in the confirmation email AWS sends
```

**Console alternative:** SES → Account dashboard → *Request production access*.

---

## 4. Give the backend's ECS task role permission to call SES

The running container's permissions come from the **task role**, not the
execution role. (The execution role is what ECS itself uses to pull the image and
read secrets *at launch*; the task role is what the application code uses *at
runtime*. SES is called by application code, so it goes on the task role.)

The role is created in `infra/terraform/compute.tf` as
`aws_iam_role.task`, named **`nutritionell-ecs-task`**. Confirm that's what the
running task is actually using:

```bash
aws ecs describe-task-definition \
  --region "$AWS_REGION" \
  --task-definition "${PREFIX}-backend" \
  --query 'taskDefinition.{task:taskRoleArn,execution:executionRoleArn}'
```

The `task` value should end in `role/nutritionell-ecs-task`. Use whatever name it
actually shows:

```bash
export TASK_ROLE=nutritionell-ecs-task   # ← from the command above
```

Attach an inline policy allowing SES sends:

```bash
cat > /tmp/ses-send-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendPasswordResetEmail",
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$TASK_ROLE" \
  --policy-name ses-send-email \
  --policy-document file:///tmp/ses-send-policy.json
```

Verify:

```bash
aws iam get-role-policy --role-name "$TASK_ROLE" --policy-name ses-send-email
```

> **On `"Resource": "*"`** — SES authorises sends against the *identity* ARN, and
> restricting it needs a `ses:FromAddress` condition rather than a resource list.
> If you want to tighten this later, replace `Resource` with the identity ARN
> (`arn:aws:ses:us-east-1:<account-id>:identity/nutritionell.com`) and add a
> `Condition` on `ses:FromAddress`. Starting permissive is fine for one
> transactional email; just don't forget it's permissive.

**Console alternative:** IAM → Roles → `nutritionell-ecs-task` → *Add permissions*
→ *Create inline policy* → JSON tab → paste the document above → name it
`ses-send-email`.

---

## 5. Store `JWT_SECRET_KEY` in Secrets Manager and wire it to the task

This is the key that signs session tokens. **If it is empty or guessable, anyone
can mint a valid token for any user.** The backend refuses to start with an empty
value (see `main.py`'s lifespan calling `require_jwt_secret()`) — that's
intentional, so a misconfigured deploy fails loudly instead of serving forgeable
sessions.

Generate a strong random value and store it, matching the naming of the existing
`nutritionell/database-url` and `nutritionell/gemini-api-key` secrets from
`data_stores.tf`:

```bash
JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')

aws secretsmanager create-secret \
  --region "$AWS_REGION" \
  --name "${PREFIX}/jwt-secret-key" \
  --description "HS256 signing key for Nutritionell access tokens" \
  --secret-string "$JWT_SECRET"
```

Note the returned ARN:

```bash
export JWT_SECRET_ARN=$(aws secretsmanager describe-secret \
  --region "$AWS_REGION" --secret-id "${PREFIX}/jwt-secret-key" \
  --query 'ARN' --output text)
echo "$JWT_SECRET_ARN"
```

> Don't echo `$JWT_SECRET` itself into anything persistent — no `.env` committed,
> no shell history file you keep. Rotating it later is a one-line
> `put-secret-value`, but every existing session token becomes invalid the moment
> you do (they're signed with the old key), so users get logged out.

Two things now have to change on the ECS side, and **both** are needed:

**(a) Let the execution role read the new secret.** The inline policy
`read-secrets` on `nutritionell-ecs-execution` currently lists only the
database-url and gemini-api-key ARNs (see `compute.tf`), so without this the task
will fail to start with an `AccessDeniedException` on secret retrieval:

```bash
export EXEC_ROLE=nutritionell-ecs-execution   # confirm via the describe-task-definition in step 4

# Read the existing policy so you extend rather than replace it
aws iam get-role-policy --role-name "$EXEC_ROLE" --policy-name read-secrets \
  --query 'PolicyDocument' > /tmp/read-secrets-current.json
cat /tmp/read-secrets-current.json
```

Edit `/tmp/read-secrets-current.json` to add the JWT secret ARN to the existing
`Resource` list (keep the other two), then:

```bash
aws iam put-role-policy \
  --role-name "$EXEC_ROLE" \
  --policy-name read-secrets \
  --policy-document file:///tmp/read-secrets-current.json
```

**(b) Add the secret to the task definition** so it lands in the container as the
`JWT_SECRET_KEY` environment variable, next to `DATABASE_URL` and
`GEMINI_API_KEY`. `app/config.py` reads it automatically — pydantic-settings maps
the env var to the `jwt_secret_key` field, no code change needed.

Easiest reliable path is the console: ECS → Task definitions → `nutritionell-backend`
→ *Create new revision* → container `backend` → *Environment variables* → add:

| Key | Value type | Value |
| --- | --- | --- |
| `JWT_SECRET_KEY` | ValueFrom | *(the ARN from `$JWT_SECRET_ARN`)* |

While you're in there, consider also setting `APP_BASE_URL` to
`https://app.nutritionell.com` as a plain environment variable. The code already
defaults to that, so it's optional — set it only if you want the reset-link host
to be visible in the task definition rather than baked into a default.

Then update the service to the new revision:

```bash
aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "${PREFIX}-cluster" \
  --service "${PREFIX}-backend" \
  --task-definition "${PREFIX}-backend" \
  --force-new-deployment
```

> **Terraform note:** `compute.tf` defines this task definition, so the next
> `terraform apply` will want to revert your manual revision. Either apply this
> change to `compute.tf` as well (add the secret to the `secrets` list and the
> ARN to the execution role's policy), or accept that you must redo it after each
> apply. Adding it to `compute.tf` is the better long-term answer — the *secret
> value* stays out of Terraform either way, since only the ARN is referenced.

---

## 6. Run the database migration against RDS

The new tables (`users`, `password_reset_tokens`) and the
`user_profiles.user_id` column ship as `scripts/migrate_add_user_auth.py`, which
`scripts/setup_db.sh` now runs. **It has not been run anywhere** — no local
Postgres and no RDS access existed while the code was written.

RDS is not publicly reachable; use the existing SSM tunnel process documented in
`Application/backend/README.md`.

In terminal 1 — open the tunnel and leave it running:

```bash
cd Application/backend
bash scripts/tunnel_rds.sh
```

In terminal 2 — load the real DB URL and run the migrations:

```bash
cd Application/backend
source scripts/load_secrets.sh          # pulls nutritionell/database-url
DATABASE_URL="postgresql+asyncpg://nutritionell:<password>@localhost:5433/nutritionell_db" \
  bash scripts/setup_db.sh
```

`setup_db.sh` is safe to re-run: every statement in the new migration uses
`CREATE TABLE / ADD COLUMN / CREATE INDEX ... IF NOT EXISTS`, and the one
statement that can't (`ADD CONSTRAINT`) checks `pg_constraint` first.

Expected output includes:

```
==> Running auth migration (users, password_reset_tokens, user_profiles.user_id)...
✅  CREATE TABLE IF NOT EXISTS users …
✅  CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email …
✅  CREATE TABLE IF NOT EXISTS password_reset_tokens …
✅  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS user_id …
```

If any pre-auth profiles exist, it will also print a count of rows left without
an owner. That's expected — by decision there is no backfill. Those rows are
unreachable through the API (every lookup goes through the authenticated user)
and can be deleted whenever you like:

```sql
-- optional cleanup, only if you're sure nothing references them
DELETE FROM user_profiles WHERE user_id IS NULL;
```

Sanity-check the result:

```bash
psql "postgresql://nutritionell:<password>@localhost:5433/nutritionell_db" \
  -c "\d users" -c "\d password_reset_tokens" -c "\d user_profiles"
```

---

## 7. Rebuild and redeploy the backend

The new code needs `passlib`, `bcrypt`, `pyjwt`, `email-validator` and `boto3`,
all added to `requirements.txt`. None of them are in the currently-running image,
so the deploy is not optional — the container will fail to import without it.

```bash
cd Application/backend
bash scripts/deploy_backend.sh
```

See `Application/backend/deploy-to-ecr.md` for what that script does and for the
manual `docker build` / `aws ecr get-login-password` equivalent if it fails.

Watch the deployment reach a steady state:

```bash
aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "${PREFIX}-cluster" \
  --services "${PREFIX}-backend" \
  --query 'services[0].deployments'
```

If tasks start and immediately die, check the logs — the two most likely causes
are both configuration, not code:

```bash
aws logs tail "/ecs/${PREFIX}-backend" --region "$AWS_REGION" --since 10m
```

- `JWT_SECRET_KEY is not set. Refusing to issue or accept tokens…` → step 5(b)
  didn't take effect; the new task definition revision isn't the one running.
- `AccessDeniedException` retrieving a secret → step 5(a); the execution role
  can't read the new secret ARN.

---

## Order and dependencies at a glance

```
1. Verify SES domain identity          ─┐
2. Publish DKIM CNAMEs in Route53      ─┴─► email can send at all
3. Request production access           ───► email reaches real users
4. SES permission on ECS task role     ───► the app is allowed to send
5. JWT secret + task definition wiring ───► the app can start
6. Run the DB migration                ───► signup/login have tables to write
7. Rebuild + redeploy                  ───► the new code actually runs
```

Steps 5, 6 and 7 are the ones that gate the feature working at all. Steps 1–4
only gate the password-reset email; signup and login work without them.

---

## Smoke test once everything is deployed

```bash
API=https://api.nutritionell.com

# 1. Sign up
curl -sS -X POST "$API/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourmail.com","password":"a-strong-test-password"}' | tee /tmp/signup.json

TOKEN=$(python3 -c 'import json;print(json.load(open("/tmp/signup.json"))["access_token"])')

# 2. Restore the session
curl -sS "$API/api/auth/me" -H "Authorization: Bearer $TOKEN"

# 3. The profile is auth-scoped
curl -sS "$API/api/profile/me" -H "Authorization: Bearer $TOKEN"

# 4. And unreachable without a token — this MUST be 401
curl -sS -o /dev/null -w '%{http_code}\n' "$API/api/profile/me"

# 5. Password reset (only delivers once step 3 is approved, or to a verified address)
curl -sS -X POST "$API/api/auth/forgot-password" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourmail.com"}'
```

Step 4 returning `401` is the whole point of this change. If it returns `200`,
the old image is still running — go back to step 7.

---

## Bootstrapping the first admin (temporary approval gate)

A later change added a **temporary admin-approval gate**: signup stays open, but a
new account can't reach any real feature until an admin approves it. Details and
the day-to-day curl commands are in the *Admin approval (temporary)* section of
`Application/backend/README.md`.

**No new AWS infrastructure is needed for it.** It reuses the SES setup from
steps 1–4 above (the "someone signed up" notification goes to
`nutritionell@gmail.com` via the same verified identity and the same task-role
permission) and the RDS tunnel process from step 6. There is nothing to
provision here.

Two things do need doing once, in this order.

### a. Run the approval migration

`scripts/migrate_add_admin_approval.py` adds `users.is_approved` and
`users.is_admin`. `setup_db.sh` runs it, so this is the same command as step 6 —
re-run it after deploying the new code:

```bash
# terminal 1
cd Application/backend && bash scripts/tunnel_rds.sh

# terminal 2
cd Application/backend
source scripts/load_secrets.sh
DATABASE_URL="postgresql+asyncpg://nutritionell:<password>@localhost:5433/nutritionell_db" \
  bash scripts/setup_db.sh
```

Safe to re-run. Note that **existing accounts default to `is_approved = false`**,
so everyone who signed up before the gate becomes pending. That's intended — the
point is that nobody has access until it's granted — but it means you should
approve yourself first (next step) and then anyone else who should keep working.

### b. Make yourself an admin, by hand

There is deliberately **no endpoint that can create the first admin**. Every
`/api/admin/*` route requires an admin token, so the first one has to come from
the database. That chicken-and-egg is the correct outcome, not a gap to work
around: it means nothing reachable over the network can grant itself admin.

1. **Sign up normally through the app** with the email you want to use. You'll
   land in the pending state, which is fine.
2. With the tunnel from (a) still open, flip both flags:

```bash
psql "postgresql://nutritionell:<password>@localhost:5433/nutritionell_db" \
  -c "UPDATE users SET is_admin = true, is_approved = true WHERE email = 'you@yourmail.com';"
```

   Setting `is_admin` alone is enough — an admin is always treated as approved —
   but setting both is clearer and costs nothing.

3. Confirm it took:

```bash
psql "postgresql://nutritionell:<password>@localhost:5433/nutritionell_db" \
  -c "SELECT email, is_approved, is_admin FROM users ORDER BY created_at;"
```

4. Then log in through the API and check the admin routes answer:

```bash
API=https://api.nutritionell.com
TOKEN=$(curl -sS -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourmail.com","password":"<your password>"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

curl -sS "$API/api/admin/users/pending" -H "Authorization: Bearer $TOKEN"
```

A `403` here means the `UPDATE` didn't land on the account you're logging in as —
check the email matches exactly (it's stored lowercased).

---

## Known limitations shipped deliberately

Neither is an oversight; both are recorded here so the next person doesn't
mistake them for bugs.

- **A single long-lived access token (30 days), no refresh-token rotation.** A
  stolen token is usable until it expires.
- **Password reset does not revoke existing sessions.** Tokens are stateless, so
  a token minted before a reset stays valid on other devices until it expires.
  Fixing this needs token versioning (a counter on the user row, checked at
  decode time) or a denylist.
