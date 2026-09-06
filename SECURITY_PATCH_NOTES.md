# Security patch SEC-02 -> SEC-27 + hardening

- SEC-23: deletion-request cancellation now requires the initiator or a WebUser ADMIN.
- SEC-24 hardening: WebUser provisioning explicitly rejects any role outside SUPERVISION/ADMIN, and root remains non-provisionable/non-editable through this API.
- SEC-26 hardening: device listing masks push tokens; raw tokens are no longer returned by GET /devices.
- SEC-27: public partner-application responses are generic and do not expose application data.

No new environment variable is required by these changes.
