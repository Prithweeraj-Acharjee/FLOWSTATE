# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 2.x | Yes |
| 1.x | No |

## Privacy

FlowState runs **entirely in your browser**. It does not:
- Send any data to external servers
- Collect conversation content
- Require an account or API key
- Make any network requests

All scoring is performed locally using the `quality.js` engine. Chrome storage (`chrome.storage.local`) is used only to persist scores within your own browser.

## Reporting a Vulnerability

If you find a security vulnerability (e.g., XSS via DOM injection, data leakage, privilege escalation), please **do not open a public issue**.

Email: himantar.cse@gmail.com with subject `[FlowState Security]`

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You'll receive a response within 72 hours. We'll coordinate on a fix and credit you in the release notes if you'd like.
