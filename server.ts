import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

dotenv.config();

// Initialize Firebase for server-side use
let db: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log("Firebase initialized in server.ts");
  }
} catch (error) {
  console.error("Failed to initialize Firebase in server.ts:", error);
}

async function getSMTPSettings() {
  // Try to get from Firestore first
  if (db) {
    try {
      const smtpDoc = await getDoc(doc(db, "settings", "smtp"));
      if (smtpDoc.exists()) {
        const data = smtpDoc.data().data;
        if (data && data.host) {
          console.log("Using SMTP settings from Firestore");
          return {
            host: data.host,
            port: parseInt(data.port),
            user: data.user,
            pass: data.pass,
            from: data.from || data.user
          };
        }
      }
    } catch (error) {
      console.error("Error fetching SMTP settings from Firestore:", error);
    }
  }

  // Fallback to environment variables
  console.log("Using SMTP settings from environment variables");
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/smtp-status", async (req, res) => {
    const { host, port, user, pass, from } = await getSMTPSettings();
    const isConfigured = !!(host && port && user && pass);
    res.json({
      SMTP_HOST: !!host,
      SMTP_PORT: !!port,
      SMTP_USER: !!user,
      SMTP_PASS: !!pass,
      SMTP_FROM: !!from,
      host: host || "Not Set",
      port: port || "Not Set",
      user: user || "Not Set",
      from: from || "Not Set",
      configured: isConfigured
    });
  });

  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check for SMTP configuration
    const { host, port, user, pass, from } = await getSMTPSettings();

    if (!host || !user || !pass) {
      console.warn("SMTP configuration is missing. Email not sent.");
      console.log("Email that would have been sent:", { to, subject });
      // We'll return 200 but with a warning to avoid breaking the frontend
      return res.status(200).json({ 
        status: "warning", 
        message: "Email not sent because SMTP configuration is missing. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in the Secrets panel." 
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
        // Office 365 / Outlook specific settings
        // authMethod: 'LOGIN', // Let nodemailer negotiate
        tls: {
          // Do not fail on invalid certs
          rejectUnauthorized: false,
          // Modern servers expect TLSv1.2 or higher
          minVersion: 'TLSv1.2'
        },
        // Force STARTTLS for port 587
        requireTLS: port === 587,
        // Enable debug logging to help diagnose issues in the console
        debug: true,
        logger: true
      });

      // Verify connection configuration
      try {
        await transporter.verify();
      } catch (verifyError: any) {
        console.error("SMTP Verification failed:", verifyError);
        throw verifyError;
      }

      await transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      res.json({ status: "ok", message: "Email sent successfully" });
    } catch (error: any) {
      console.error("Failed to send email:", error);
      
      let errorMessage = "Failed to send email";
      let details = error.message || String(error);

      // Specific handling for Microsoft 365 / Outlook authentication errors
      // Error 535 5.7.139 is a very common Office 365 error indicating SMTP AUTH is disabled
      if (details.includes("535 5.7.139")) {
        errorMessage = "Microsoft 365 SMTP Authentication Failed";
        details = "The SMTP server (Office 365) rejected your login. This is a common security restriction in Microsoft 365.\n\nREQUIRED ACTIONS:\n1. ENABLE SMTP AUTH: Open Microsoft 365 Admin Center > Users > Active Users > Select User > Mail > Manage email apps > Check 'Authenticated SMTP' and Save.\n2. APP PASSWORD: If you have Multi-Factor Authentication (MFA) enabled, you MUST generate and use an 'App Password' instead of your regular password.\n3. DISABLE SECURITY DEFAULTS: If the above doesn't work, your organization might have 'Security Defaults' enabled which blocks SMTP AUTH. This must be disabled in Azure AD / Entra ID by an admin.\n\nOfficial Microsoft Guide: https://aka.ms/smtp-auth-disabled";
      } else if (details.includes("ECONNREFUSED") || details.includes("ENOTFOUND")) {
        errorMessage = "SMTP Connection Failed";
        details = `Could not connect to SMTP host ${host} on port ${port}. Please check your host and port settings. If using Office 365, ensure host is 'smtp.office365.com' and port is 587.`;
      } else if (details.includes("ETIMEDOUT")) {
        errorMessage = "Connection Timeout";
        details = `Connection to ${host} timed out. Please check your network or firewall settings.`;
      }

      res.status(500).json({ error: errorMessage, details });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
