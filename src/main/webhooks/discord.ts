import https from "https";
import { URL } from "url";

const DISCORD_HOST_PATTERN = /^(discord\.com|discordapp\.com)$/;
const DISCORD_PATH_PATTERN = /^\/api\/webhooks\//;

export function isDiscordWebhook(webhookUrl: string): boolean {
  try {
    const parsed = new URL(webhookUrl);
    return (
      parsed.protocol === "https:" &&
      DISCORD_HOST_PATTERN.test(parsed.hostname) &&
      DISCORD_PATH_PATTERN.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

interface DiscordPayload {
  comment: string;
  screenshotBuffer: Buffer;
  platform: string;
  timestamp: string;
}

export function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordPayload
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(webhookUrl);
    const boundary = `----SnapportBoundary${Date.now()}`;

    const embed = {
      title: "Bug Report",
      description: payload.comment || "_No comment provided_",
      color: 0x5865f2, // Discord blurple
      image: { url: "attachment://screenshot.png" },
      footer: { text: `Snapport · ${payload.platform}` },
      timestamp: payload.timestamp,
    };

    const jsonPart = JSON.stringify({
      embeds: [embed],
    });

    // Build multipart/form-data body
    const parts: Buffer[] = [];

    // Part 1: JSON payload
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="payload_json"\r\n` +
          `Content-Type: application/json\r\n\r\n` +
          jsonPart +
          `\r\n`
      )
    );

    // Part 2: Screenshot file
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files[0]"; filename="screenshot.png"\r\n` +
          `Content-Type: image/png\r\n\r\n`
      )
    );
    parts.push(payload.screenshotBuffer);
    parts.push(Buffer.from(`\r\n`));

    // Closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
        "User-Agent": "Snapport/0.1.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body: data })
      );
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
