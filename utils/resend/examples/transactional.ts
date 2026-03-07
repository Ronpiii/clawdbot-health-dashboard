/**
 * Transactional Email Patterns with Resend + React Email
 *
 * npm install resend @react-email/components
 */

import { Resend } from "resend";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

// --- Client Setup ---

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || "App <noreply@yourdomain.com>";
const BASE_URL = process.env.APP_URL || "https://yourdomain.com";

// --- Types ---

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

// --- Email Templates ---

interface WelcomeEmailProps {
  userName: string;
  loginUrl: string;
}

const WelcomeEmail: React.FC<WelcomeEmailProps> = ({ userName, loginUrl }) => (
  <Html>
    <Head />
    <Preview>Welcome to the platform!</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Heading style={styles.heading}>Welcome, {userName}!</Heading>
        <Text style={styles.text}>
          Thanks for signing up. We're excited to have you on board.
        </Text>
        <Section style={styles.buttonContainer}>
          <Button style={styles.button} href={loginUrl}>
            Get Started
          </Button>
        </Section>
        <Hr style={styles.hr} />
        <Text style={styles.footer}>
          If you didn't create this account, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

interface AlertEmailProps {
  userName: string;
  alertType: string;
  message: string;
  actionUrl: string;
}

const AlertEmail: React.FC<AlertEmailProps> = ({
  userName,
  alertType,
  message,
  actionUrl,
}) => (
  <Html>
    <Head />
    <Preview>
      {alertType}: {message.slice(0, 50)}
    </Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Heading style={styles.heading}>{alertType}</Heading>
        <Text style={styles.text}>Hi {userName},</Text>
        <Text style={styles.text}>{message}</Text>
        <Section style={styles.buttonContainer}>
          <Button style={styles.button} href={actionUrl}>
            View Details
          </Button>
        </Section>
      </Container>
    </Body>
  </Html>
);

// --- Styles ---

const styles = {
  body: {
    backgroundColor: "#f6f9fc",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    padding: "32px",
    borderRadius: "8px",
    maxWidth: "560px",
  },
  heading: {
    color: "#1f2937",
    fontSize: "24px",
    fontWeight: "bold" as const,
    margin: "0 0 16px",
  },
  text: {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  buttonContainer: {
    textAlign: "center" as const,
    margin: "24px 0",
  },
  button: {
    backgroundColor: "#4f46e5",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "bold" as const,
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 24px",
  },
  hr: {
    borderColor: "#e5e7eb",
    margin: "24px 0",
  },
  footer: {
    color: "#9ca3af",
    fontSize: "12px",
    margin: "0",
  },
};

// --- Send Functions ---

export async function sendWelcomeEmail(params: {
  to: string;
  userName: string;
}): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `Welcome to the platform, ${params.userName}!`,
      react: WelcomeEmail({
        userName: params.userName,
        loginUrl: `${BASE_URL}/login`,
      }),
    });

    if (error) {
      console.error("Failed to send welcome email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendAlertEmail(params: {
  to: string;
  userName: string;
  alertType: string;
  message: string;
  actionId: string;
}): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `${params.alertType}: Action required`,
      react: AlertEmail({
        userName: params.userName,
        alertType: params.alertType,
        message: params.message,
        actionUrl: `${BASE_URL}/actions/${params.actionId}`,
      }),
    });

    if (error) {
      console.error("Failed to send alert email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: String(err) };
  }
}

// --- Generic Send ---

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: React.ReactElement;
  replyTo?: string;
}): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      react: params.react,
      reply_to: params.replyTo,
    });

    if (error) {
      console.error("Failed to send email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: String(err) };
  }
}

// --- Usage Examples ---

/*
// Welcome email
await sendWelcomeEmail({
  to: "user@example.com",
  userName: "John",
});

// Alert email
await sendAlertEmail({
  to: "user@example.com",
  userName: "John",
  alertType: "New Message",
  message: "You have a new message from Sarah.",
  actionId: "msg_123",
});

// Generic email with HTML
await sendEmail({
  to: "user@example.com",
  subject: "Quick update",
  html: "<p>Hello!</p>",
});
*/
