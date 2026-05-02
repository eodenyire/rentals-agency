import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Route for sending reminders
  app.post("/api/send-reminder", (req, res) => {
    const { tenantEmail, tenantName, propertyName, dueDate, leadTime, amount } = req.body;
    
    console.log(`[EMAIL DISPATCH] to: ${tenantEmail}`);
    console.log(`Subject: Upcoming Rent Payment for ${propertyName}`);
    console.log(`Body: Hello ${tenantName}, this is a reminder that your rent of $${amount} is due on ${dueDate} (${leadTime} days from now).`);
    
    // Simulate slight delay
    setTimeout(() => {
      res.json({ success: true, message: "Reminder dispatched successfully" });
    }, 500);
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
