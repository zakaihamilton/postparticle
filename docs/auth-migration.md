# Perminister authentication

PostParticle uses Perminister for account identity, passwords, sessions, product-admin status, and
project permissions. There is no local authentication provider or fallback. Configure these
server-only values in each environment:

```dotenv
PERMINISTER_BASE_URL=https://www.perminister.com
PERMINISTER_APP_CLIENT_ID=<postparticle-client-uuid>
PERMINSITER_APP_CLIENT_SECRET=<postparticle-client-secret>
# Optional fallback for existing Vercel secrets that cannot be renamed:
PERMINISTER_CLIENT_SECRET=<postparticle-client-secret>
```

`PERMINSITER_APP_CLIENT_SECRET` takes precedence when both names are set. The app accepts
`PERMINISTER_CLIENT_SECRET` as a fallback so existing Vercel environments can keep their current
secret name.

Use a separate Perminister client for development and preview deployments, and select the organization
that owns each project's data. The PostParticle product client must be restricted to the matching
application origin. Keep the client
secret out of browser code, logs, and repository files.

The login page offers **Sign in with Perminister**. The callback is
`/auth/perminister/callback` on the exact origin registered for that app client. The backend completes
the authorization-code exchange with PKCE and stores the resulting app-bound session in the existing
PostParticle cookie.

In development, localhost, `127.0.0.1`, and `[::1]` origins are accepted on any port. Perminister
SSO returns to the same local origin that started sign-in, so register that callback URL on the
development client (for example, `http://localhost:3000/auth/perminister/callback`).

New and changed passwords must be 15–256 characters. Imported legacy passwords remain usable until
changed; Perminister rehashes them after a successful login. PostParticle fails closed when
Perminister is unavailable. Account creation and reset are available to platform administrators in
**Platform accounts**; project permissions are managed from **Members**.

The completed production migration imported two identities and their two project memberships. The
old PostParticle control bucket is retained as a private historical backup, but application code no
longer reads or writes its account, membership, bootstrap, or session records. The app has no control
Space credentials. Removing that archived data is a separate retention decision; it is not needed
for normal operation.
