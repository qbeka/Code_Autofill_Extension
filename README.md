# Code_Autofill_Extension
A Chrome extension that automatically reads verification codes from your Gmail inbox and fills them into website forms. Uses the Gmail API with read-only OAuth, processes everything locally, and never stores or transmits data.

---

## Features

- Automatically extracts 6-digit codes from recent Gmail messages  
- Autofills code fields on any active tab  
- Manual override via popup  
- Local-only processing (no servers or external storage)  
- Uses Gmail API with read-only OAuth permissions

---

## Security & Privacy

- Gmail is accessed via OAuth using the `gmail.readonly` scope.
- The extension never stores, sends, or logs your emails or codes.
- Code extraction and form autofill happen entirely on your local machine.
- No external services or telemetry.

This extension is **not** a data collection tool. It simply automates a common task, with user privacy as a priority.

---

## Testing

Open the included `test-form.html` file in a browser tab and send a test email to your Gmail with a message like:

Your verification code is: 123456

The extension should detect the email and autofill the test form after a short delay (polling interval).

---

## Download from Chrome Web Store

To install the stable release directly from the Chrome Web Store:  
👉 [**Download Auto Code Filler**](https://chrome.google.com/webstore/detail/auto-code-filler/your-extension-id-here)

(will replace placeholder link once it goes live)

---

## License

**All rights reserved.**  
You may not copy, distribute, modify, or reuse this code without written permission from the author.

---

## Contact

Built by Qendrim Beka  
[LinkedIn](https://www.linkedin.com/in/qendrimbeka)
[Personal Website](https://www.qendrimbeka.com)



