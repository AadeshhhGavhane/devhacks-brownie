// ============================================
// Scribble Clone — Environment Configuration
// ============================================

import { z } from "zod";

const envSchema = z.object({
    MONGODB_URI: z.string().url(),
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    MFA_ENCRYPTION_KEY: z.string().length(64), // 32 bytes in hex
    PORT: z.coerce.number().default(3000),
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),

    // SMTP (Gmail App Password)
    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().email(),
    SMTP_PASS: z.string().min(1),
    SMTP_FROM: z.string().default("Scribble <noreply@scribble.app>"),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),

    // Geoapify (Maps / Geocoding)
    GEOAPIFY_KEY: z.string().min(1),

    // PhonePe Payment Gateway
    PHONEPE_CLIENT_ID: z.string().min(1),
    PHONEPE_CLIENT_SECRET: z.string().min(1),
    PHONEPE_CLIENT_VERSION: z.string().default("1"),
    PHONEPE_BASE_URL: z.string().url(),
    PHONEPE_WEBHOOK_USERNAME: z.string().min(1),
    PHONEPE_WEBHOOK_PASSWORD: z.string().min(1),
});

function loadEnv() {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("❌ Invalid environment variables:");
        console.error(result.error.format());
        process.exit(1);
    }

    return result.data;
}

export const env = loadEnv();
