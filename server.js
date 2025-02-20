const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");

const app = express();
const port = 3000;

// In-memory storage for musician submissions
let submissions = [];

// Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (optional, if you're serving a separate frontend)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // adjust for production
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Serve static files from the current directory
app.use(express.static(__dirname));

// Optionally, serve index.html at the root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --------------------------
// Load Gig Data from JSON
// --------------------------
let gigs = [];
try {
  gigs = JSON.parse(fs.readFileSync("gigs.json", "utf8"));
  console.log("Gigs data loaded from gigs.json");
} catch (err) {
  console.error("Error loading gigs.json:", err);
}

// GET /api/gigs?genre=&minCapacity=&location=
app.get("/api/gigs", (req, res) => {
  let results = gigs;

  // Filter by genre (case-insensitive, substring match)
  if (req.query.genre) {
    const genreFilter = req.query.genre.toLowerCase();
    results = results.filter((gig) =>
      gig.genre.some((g) => g.toLowerCase().includes(genreFilter))
    );
  }

  // Filter by minimum capacity
  if (req.query.minCapacity) {
    const minCapacity = parseInt(req.query.minCapacity, 10);
    results = results.filter((gig) => gig.capacity >= minCapacity);
  }

  // Filter by location (simple substring search on the address)
  if (req.query.location) {
    const locationFilter = req.query.location.toLowerCase();
    results = results.filter((gig) =>
      gig.address.toLowerCase().includes(locationFilter)
    );
  }

  res.json(results);
});

// -------------------------
// File Upload Configuration
// -------------------------
// We now accept a single file with the field "heroBanner"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    // Prepend a timestamp to avoid collisions
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// --------------------------------------
// Helper: Generate Pretty EPK HTML Page
// --------------------------------------
function generateEPKHtml(submission) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${submission.bandName} - EPK</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
      .hero-banner img { width: 100%; max-height: 400px; object-fit: cover; }
      .container { background: white; padding: 20px; max-width: 800px; margin: -50px auto 20px auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 5px; }
      h1 { text-align: center; margin-top: 0; }
      .section { margin-bottom: 20px; }
      .section h2 { border-bottom: 1px solid #ddd; padding-bottom: 5px; }
      .social-links a { margin-right: 10px; text-decoration: underline; color: blue; }
    </style>
  </head>
  <body>
    ${
      submission.heroBanner
        ? `<div class="hero-banner"><img src="${submission.heroBanner}" alt="Hero Banner"></div>`
        : ""
    }
    <div class="container">
      <h1>${submission.bandName}</h1>
      <div class="section">
        <h2>About the Band</h2>
        <p><strong>Year Formed:</strong> ${submission.yearFormed || "N/A"}</p>
        <p><strong>Genre:</strong> ${submission.genre}</p>
        <p><strong>Location:</strong> ${submission.bandLocation || "N/A"}</p>
        <p><strong>Shows:</strong> ${submission.shows}</p>
        <p><strong>Additional Info:</strong> ${
          submission.additionalInfo || ""
        }</p>
      </div>
      <div class="section">
        <h2>Contact Information</h2>
        <p><strong>Name:</strong> ${submission.contactName}</p>
        <p><strong>Email:</strong> ${submission.contactEmail}</p>
        <p><strong>Touring:</strong> ${submission.touring}</p>
      </div>
      <div class="section">
        <h2>Social Links</h2>
        <div class="social-links">
          ${
            submission.socialLinks.instagram
              ? `<a href="${submission.socialLinks.instagram}" target="_blank">Instagram</a>`
              : ""
          }
          ${
            submission.socialLinks.twitter
              ? `<a href="${submission.socialLinks.twitter}" target="_blank">Twitter</a>`
              : ""
          }
          ${
            submission.socialLinks.facebook
              ? `<a href="${submission.socialLinks.facebook}" target="_blank">Facebook</a>`
              : ""
          }
          ${
            submission.socialLinks.tiktok
              ? `<a href="${submission.socialLinks.tiktok}" target="_blank">TikTok</a>`
              : ""
          }
          ${
            submission.socialLinks.spotify
              ? `<a href="${submission.socialLinks.spotify}" target="_blank">Spotify</a>`
              : ""
          }
          ${
            submission.socialLinks.youtube
              ? `<a href="${submission.socialLinks.youtube}" target="_blank">YouTube</a>`
              : ""
          }
          ${
            submission.socialLinks.website
              ? `<a href="${submission.socialLinks.website}" target="_blank">Website</a>`
              : ""
          }
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

// -----------------------------
// POST /api/bands - EPK Submission
// -----------------------------
app.post("/api/bands", upload.single("heroBanner"), (req, res) => {
  const {
    bandName,
    yearFormed,
    genre,
    bandLocation,
    contactFirst,
    contactLast,
    contactEmail,
    touring,
    shows,
    instagram,
    twitter,
    facebook,
    tiktok,
    spotify,
    youtube,
    website,
    additionalInfo,
  } = req.body;

  // Compute relative URL for hero banner (for display to artist)
  const heroBannerRelative = req.file
    ? "/" + path.relative(__dirname, req.file.path).split(path.sep).join("/")
    : null;
  // Build an absolute URL for the hero banner (for artist view)
  const heroBannerUrl = heroBannerRelative
    ? req.protocol + "://" + req.get("host") + heroBannerRelative
    : null;

  // Construct a submission object.
  // We'll store both the absolute URL (for artist display) and the file system path (for email attachments)
  const submission = {
    bandName,
    yearFormed,
    genre,
    bandLocation,
    contactName: `${contactFirst} ${contactLast}`,
    contactEmail,
    touring,
    shows,
    socialLinks: {
      instagram,
      twitter,
      facebook,
      tiktok,
      spotify,
      youtube,
      website,
    },
    additionalInfo,
    heroBanner: heroBannerUrl, // absolute URL for artist view
    heroBannerFilePath: req.file ? req.file.path : null, // file system path for email
  };

  // Generate a pretty EPK HTML page
  const epkHtml = generateEPKHtml(submission);
  const epkFileName = `${Date.now()}-epk.html`;
  const epkFilePath = path.join(__dirname, "uploads", epkFileName);
  fs.writeFileSync(epkFilePath, epkHtml, "utf8");

  // Compute relative URL and absolute URL for the generated EPK
  const epkRelative =
    "/" + path.relative(__dirname, epkFilePath).split(path.sep).join("/");
  const absoluteEpkUrl = req.protocol + "://" + req.get("host") + epkRelative;

  submission.epkPath = absoluteEpkUrl; // for artist view
  submission.epkFilePath = epkFilePath; // for email attachments

  // Save the submission in our in-memory list for tracking
  submissions.push(submission);

  console.log("EPK Submission Received:", submission);
  res.json({ message: "EPK submission received", submission });
});

// ------------------------------------
// GET /venue - Venue Facing Dashboard
// ------------------------------------
app.get("/venue", (req, res) => {
  // Generate an HTML page listing all musician submissions.
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Venue Dashboard</title>
    <style>
      body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
      h1 { text-align: center; }
      .submission { background: white; padding: 15px; margin: 10px auto; max-width: 600px; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 5px; }
      a.button { display: inline-block; padding: 8px 12px; margin: 5px 0; background-color: #007bff; color: white; text-decoration: none; border-radius: 3px; }
    </style>
  </head>
  <body>
    <h1>Venue Dashboard - Musician Applications</h1>
  `;
  if (submissions.length === 0) {
    html += `<p>No submissions yet.</p>`;
  } else {
    submissions.forEach((sub, index) => {
      html += `
      <div class="submission">
        <h2>${sub.bandName}</h2>
        <p><strong>Email:</strong> ${sub.contactEmail}</p>
        <p><strong>Shows:</strong> ${sub.shows}</p>
        <p><strong>Additional Info:</strong> ${sub.additionalInfo || "N/A"}</p>
        <a class="button" href="${sub.epkPath}" target="_blank">View EPK</a>
        <a class="button" href="/api/send-email/${index}" target="_blank">Send Application Email</a>
      </div>
      `;
    });
  }
  html += `</body></html>`;
  res.send(html);
});

// ---------------------------------------------
// GET /api/send-email/:submissionId - Send Email
// ---------------------------------------------
app.get("/api/send-email/:submissionId", async (req, res) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  if (
    isNaN(submissionId) ||
    submissionId < 0 ||
    submissionId >= submissions.length
  ) {
    return res.status(400).send("Invalid submission ID");
  }
  const submission = submissions[submissionId];

  // Create a test account using Ethereal (for demo purposes)
  let testAccount = await nodemailer.createTestAccount();

  // Create a transporter using Ethereal SMTP
  let transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  // Prepare email options with attachments using file system paths
  let mailOptions = {
    from: "sleepingvillage@example.com",
    to: "musician@example.com", // Hardcoded venue email
    subject: `${submission.bandName} Application`,
    text: `We loved your EPK, come perform tomorrow! ${submission.bandName}.`,
    attachments: [
      {
        filename: path.basename(submission.epkFilePath),
        path: submission.epkFilePath,
      },
      // Attach the hero banner image if it exists
      ...(submission.heroBannerFilePath
        ? [
            {
              filename: path.basename(submission.heroBannerFilePath),
              path: submission.heroBannerFilePath,
            },
          ]
        : []),
    ],
  };

  // Send the email
  let info = await transporter.sendMail(mailOptions);
  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

  res.send(
    `Email sent! Preview it at: <a href="${nodemailer.getTestMessageUrl(
      info
    )}" target="_blank">${nodemailer.getTestMessageUrl(info)}</a>`
  );
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
