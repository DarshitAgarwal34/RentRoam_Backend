let cachedTransporter = null;

function getMailerConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@rentroam.local",
  };
}

function getTransporter() {
  const config = getMailerConfig();

  if (!config.host || !config.user || !config.pass) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  try {
    const nodemailer = require("nodemailer");
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    return cachedTransporter;
  } catch (err) {
    console.warn("Mailer unavailable. Install nodemailer to enable emails.", err.message);
    return null;
  }
}

async function sendBookingNotificationEmails(booking) {
  const transporter = getTransporter();
  const config = getMailerConfig();

  if (!transporter) {
    return { sent: false, reason: "mailer_unavailable" };
  }

  const customerEmail = booking?.customer?.email;
  const ownerEmail = booking?.owner?.email;
  const vehicleLabel = `${booking?.vehicle?.make || ""} ${booking?.vehicle?.model || ""}`.trim();
  const subject = `RentRoam booking confirmed: ${vehicleLabel || `Vehicle #${booking?.vehicle_id}`}`;

  const baseLines = [
    `Booking ID: ${booking?.id}`,
    `Vehicle: ${vehicleLabel || booking?.vehicle_id}`,
    `Pickup date: ${booking?.start_date}`,
    `Drop date: ${booking?.end_date}`,
    `Pickup city: ${booking?.pickup_city || "-"}`,
    `Payment method: ${booking?.payment_method || "-"}`,
    `Total price: Rs. ${booking?.total_price ?? 0}`,
    `Status: ${booking?.status || "confirmed"}`,
  ].join("\n");

  const jobs = [];

  if (customerEmail) {
    jobs.push(
      transporter.sendMail({
        from: config.from,
        to: customerEmail,
        subject,
        text: `Hello ${booking?.customer?.name || "Customer"},\n\nYour booking has been confirmed.\n\n${baseLines}\n\nThank you for using RentRoam.`,
      })
    );
  }

  if (ownerEmail) {
    jobs.push(
      transporter.sendMail({
        from: config.from,
        to: ownerEmail,
        subject: `New booking received for ${vehicleLabel || `Vehicle #${booking?.vehicle_id}`}`,
        text: `Hello ${booking?.owner?.name || "Owner"},\n\nA new booking has been made for your vehicle.\n\n${baseLines}\n\nCustomer: ${booking?.customer?.name || "-"} (${booking?.customer?.email || "-"})`,
      })
    );
  }

  if (jobs.length === 0) {
    return { sent: false, reason: "missing_recipient_email" };
  }

  await Promise.all(jobs);
  return { sent: true };
}

module.exports = {
  sendBookingNotificationEmails,
};
