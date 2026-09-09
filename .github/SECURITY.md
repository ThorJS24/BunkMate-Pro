# Security Policy & Responsible Disclosure

## 🛡️ Security Architecture

BunkMate Pro is built with a **Local-First, Zero-Telemetry Privacy Architecture**:

1. **On-Device Encrypted Storage**: Student Register Numbers and ESPRO Passwords are encrypted on-device using Windows DPAPI (`safeStorage`) and AES-256-GCM.
2. **Volatile Memory Handling**: Passwords exist in plaintext strictly in volatile memory during active HTTPS auth handshakes with official CHRIST University endpoints (`espro.christuniversity.in`). Plaintext credentials are zeroed out immediately after.
3. **No Third-Party Analytics**: BunkMate Pro operates zero remote cloud servers or telemetry trackers.

---

## 🔒 Reporting a Vulnerability

If you discover a security vulnerability in BunkMate Pro, please report it responsibly:

- **Email**: Create a private security report or contact the maintainers via GitHub Security Advisories at [https://github.com/ThorJS24/HolyAttendance/security/advisories](https://github.com/ThorJS24/HolyAttendance/security/advisories).
- **Response Time**: Maintainers will acknowledge security reports within **24–48 hours** and provide a patch timeline.

Please do **NOT** open public GitHub issues for unpatched security vulnerabilities.
