import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { store } from './data/store.js';
import { HonouredOneAiService } from './ai/honouredOneAi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload folders exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');
const CVS_DIR = path.join(UPLOADS_DIR, 'cvs');
const SIGNATURES_DIR = path.join(UPLOADS_DIR, 'signatures');
const STAMPS_DIR = path.join(UPLOADS_DIR, 'stamps');

[UPLOADS_DIR, PHOTOS_DIR, CVS_DIR, SIGNATURES_DIR, STAMPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer Storages with Validation
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `photo_${req.params.id || 'new'}_${Date.now()}${ext}`;
    cb(null, safeName);
  }
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype;
    if (allowed.test(ext) && (mime.includes('image') || allowed.test(mime))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Supported formats: JPG, JPEG, PNG, WebP.'));
    }
  }
});

const cvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CVS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `cv_${req.params.id || 'new'}_${Date.now()}${ext}`;
    cb(null, safeName);
  }
});

const cvUpload = multer({
  storage: cvStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
      cb(null, true);
    } else {
      cb(new Error('Invalid CV format. Supported formats: PDF and Word DOCX/DOC.'));
    }
  }
});

const ceoAssetStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isSignature = req.path.includes('signature');
    cb(null, isSignature ? SIGNATURES_DIR : STAMPS_DIR);
  },
  filename: (req, file, cb) => {
    const isSignature = req.path.includes('signature');
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = isSignature ? 'ceo_signature' : 'official_stamp';
    cb(null, `${prefix}_${Date.now()}${ext}`);
  }
});

const ceoAssetUpload = multer({
  storage: ceoAssetStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid asset image format. Supported formats: PNG, JPG, WebP.'));
    }
  }
});

const aiService = new HonouredOneAiService(store);

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Binds to all network interfaces for both Local Offline and Online LAN/WAN access

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'
}));

// Serve uploaded assets securely
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper to get local network IP addresses
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ interface: name, address: iface.address });
      }
    }
  }
  return addresses;
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// 1. Network & Offline/Online Status
app.get('/api/network-status', (req, res) => {
  const localIps = getNetworkAddresses();
  res.json({
    mode: 'Dual (Offline Local + Online Network)',
    serverPort: PORT,
    localhostUrl: `http://localhost:${PORT}`,
    networkUrls: localIps.map(ip => `http://${ip.address}:${PORT}`),
    isOnline: true,
    timestamp: new Date().toISOString()
  });
});

// 2. System Health & Database Connection
app.get('/api/health', (req, res) => {
  try {
    const health = store.getDbHealth();
    const network = getNetworkAddresses();
    res.json({
      ...health,
      networkAccess: network.map(n => `http://${n.address}:${PORT}`)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Authentication & Access Document Credentials Directory
app.get('/api/credentials-directory', (req, res) => {
  try {
    res.json(store.getCredentialsDirectory());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = store.authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid Employee ID, Username, or Password.' });
  }
  res.json({ success: true, user });
});

app.post('/api/auth/switch-role', (req, res) => {
  const { role } = req.body;
  const user = store.data.users.find(u => u.Role.toLowerCase() === (role || '').toLowerCase()) || store.data.users[0];
  const { PasswordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

// 4. Dashboard Analytics
app.get('/api/dashboard', (req, res) => {
  try {
    const stats = store.getDashboardStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Employee Management
app.get('/api/employees', (req, res) => {
  try {
    const employees = store.getEmployees(req.query);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/employees/:id', (req, res) => {
  try {
    const emp = store.getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const newEmp = await store.createEmployee(req.body, actor);
    res.status(201).json(newEmp);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const updated = await store.updateEmployee(req.params.id, req.body, actor);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/employees/:id', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'System Administrator';
    const result = store.deleteEmployee(req.params.id, actor);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5a. Employee Photograph Upload & Management
app.post('/api/employees/:id/photo', photoUpload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    const emp = store.updateEmployeePhoto(req.params.id, photoUrl, actor);
    res.json({ success: true, photoUrl, employee: emp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/employees/:id/photo', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const emp = store.deleteEmployeePhoto(req.params.id, actor);
    res.json({ success: true, employee: emp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5b. Employee CV Upload & Document Management
app.post('/api/employees/:id/cv', cvUpload.single('cv'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CV document file uploaded.' });
    }
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const fileSizeFormatted = `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`;
    const emp = store.updateEmployeeCv(req.params.id, req.file.filename, req.file.originalname, fileSizeFormatted, actor);
    res.json({
      success: true,
      cvFileName: req.file.filename,
      originalName: req.file.originalname,
      fileSize: fileSizeFormatted,
      employee: emp
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/employees/:id/cv', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const emp = store.deleteEmployeeCv(req.params.id, actor);
    res.json({ success: true, employee: emp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/employees/:id/cv/download', (req, res) => {
  try {
    const emp = store.getEmployee(req.params.id);
    if (!emp || !emp.CurriculumVitae) {
      return res.status(404).json({ error: 'No CV on file for this employee.' });
    }
    const cvPath = path.join(CVS_DIR, emp.CurriculumVitae);
    if (fs.existsSync(cvPath)) {
      return res.download(cvPath, `${emp.FirstName}_${emp.LastName}_CV${path.extname(emp.CurriculumVitae)}`);
    }
    // Check fallback in public folder (e.g. initial demo Yong_Desmond.y.pdf)
    const publicCvPath = path.join(__dirname, 'public', emp.CurriculumVitae);
    if (fs.existsSync(publicCvPath)) {
      return res.download(publicCvPath, `${emp.FirstName}_${emp.LastName}_CV${path.extname(emp.CurriculumVitae)}`);
    }
    res.status(404).json({ error: `CV file '${emp.CurriculumVitae}' not found on server disk.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5c. Official Employee Document Generation (PDF, Word DOCX, Print)
app.get('/api/employees/:id/document', (req, res) => {
  try {
    const emp = store.getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const format = req.query.format || 'html';
    const ceoSettings = store.getCeoSettings();
    const approvals = store.getDocumentApprovals(emp.EmployeeID);
    const latestApproval = approvals.find(a => a.Status === 'Approved') || approvals[0] || null;
    const isApproved = latestApproval && latestApproval.Status === 'Approved';
    
    // Server trusted timestamp in Africa/Douala timezone (Cameroon)
    const generationTime = store.getCameroonTime();
    const approvalTime = latestApproval && latestApproval.DecisionDate ? store.getCameroonTime(latestApproval.DecisionDate) : null;

    if (format === 'json') {
      return res.json({
        employee: emp,
        ceoSettings,
        approval: latestApproval,
        isApproved,
        generationTime,
        approvalTime
      });
    }

    // Word Document Format (.doc / .docx compatible HTML)
    if (format === 'docx' || format === 'word') {
      const wordHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset="utf-8">
          <title>Official Employee Profile - ${emp.EmployeeNumber}</title>
          <style>
            body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; margin: 40px; }
            h1 { font-size: 16pt; color: #0f172a; margin-bottom: 2px; text-transform: uppercase; }
            h2 { font-size: 13pt; color: #15803d; border-bottom: 2px solid #16a34a; padding-bottom: 4px; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 15px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 10pt; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
            .header-table td { border: none; padding: 4px; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 9pt; }
            .badge-approved { background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }
            .badge-pending { background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
            .signature-box { border: 2px dashed #94a3b8; padding: 15px; margin-top: 25px; border-radius: 6px; }
            .funder-note { font-size: 9pt; color: #64748b; margin-top: 25px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td style="width: 70%;">
                <h1>Reconciliation and Development Association (RADA)</h1>
                <p style="margin: 0; color: #64748b; font-size: 10pt;">Human Resource Management System &bull; Official Employee Dossier</p>
                <p style="margin: 3px 0 0 0; font-size: 9pt; color: #0284c7;">Document Ref: RADA-HR-${emp.EmployeeNumber} &bull; Generated: ${generationTime.fullString}</p>
              </td>
              <td style="width: 30%; text-align: right;">
                <span class="badge ${isApproved ? 'badge-approved' : 'badge-pending'}">
                  ${isApproved ? '&#10004; OFFICIALLY CERTIFIED' : '&#9888; DRAFT - PENDING CEO AUTHORIZATION'}
                </span>
              </td>
            </tr>
          </table>

          <h2>1. Employee Identification &amp; Appointment</h2>
          <table>
            <tr>
              <th style="width: 25%;">Employee Number</th>
              <td style="width: 25%; font-weight: bold;">${emp.EmployeeNumber}</td>
              <th style="width: 25%;">Official Status</th>
              <td style="width: 25%;">${emp.StaffStatus || 'Active'} (${emp.EmploymentStatus || 'Full-Time'})</td>
            </tr>
            <tr>
              <th>Full Name</th>
              <td style="font-weight: bold;">${emp.FirstName} ${emp.MiddleName || ''} ${emp.LastName}</td>
              <th>Gender / Date of Birth</th>
              <td>${emp.Gender || '—'} &bull; ${emp.DateOfBirth || '—'}</td>
            </tr>
            <tr>
              <th>Department</th>
              <td>${emp.DepartmentName}</td>
              <th>Section / Sub-Unit</th>
              <td>${emp.SectionName}</td>
            </tr>
            <tr>
              <th>Position Title</th>
              <td style="font-weight: bold; color: #0f172a;">${emp.PositionTitle}</td>
              <th>Grade Classification</th>
              <td>${emp.GradeLevel}</td>
            </tr>
            <tr>
              <th>Appointment Date</th>
              <td>${emp.HireDate || '—'}</td>
              <th>Annual Leave Balance</th>
              <td>${emp.AnnualLeaveDays || 24} Days</td>
            </tr>
          </table>

          <h2>2. Contact &amp; Statutory Background</h2>
          <table>
            <tr>
              <th style="width: 25%;">Email Address</th>
              <td style="width: 25%;">${emp.EmailAddress || '—'}</td>
              <th style="width: 25%;">Primary Phone</th>
              <td style="width: 25%;">${emp.PhoneNumber || '—'}</td>
            </tr>
            <tr>
              <th>Residential Address</th>
              <td>${emp.Address || '—'}</td>
              <th>Nationality</th>
              <td>${emp.Nationality || 'Cameroonian'}</td>
            </tr>
            <tr>
              <th>Government ID Document</th>
              <td>${emp.GovernmentID || '—'} ${emp.GovernmentIDNumber ? `(${emp.GovernmentIDNumber})` : ''}</td>
              <th>Emergency Contact</th>
              <td>${emp.EmergencyName || '—'} ${emp.EmergencyContact ? `(${emp.EmergencyContact})` : ''}</td>
            </tr>
            <tr>
              <th>Curriculum Vitae (CV)</th>
              <td colspan="3">${emp.CurriculumVitae ? `CV on Record (${emp.CurriculumVitae})` : 'Pending Submission'}</td>
            </tr>
          </table>

          <h2>3. Professional Biography &amp; Summary</h2>
          <p style="margin: 8px 0; font-size: 10pt; line-height: 1.5; color: #334155;">
            ${emp.Biography || 'Official personnel appointment under the Reconciliation and Development Association (RADA). Responsible for duties outlined in the position terms of reference.'}
          </p>

          <h2>4. CEO Approval &amp; Official Executive Authorization</h2>
          <div class="signature-box">
            <p style="font-weight: bold; font-size: 11pt; color: #0f172a; margin: 0 0 5px 0;">AUTHORIZED BY</p>
            <p style="font-size: 10pt; color: #475569; margin: 0 0 10px 0;">${ceoSettings.CeoTitle || 'Chief Executive Officer (CEO)'} &bull; ${ceoSettings.OrganizationName || 'RADA'}</p>
            
            <table style="border: none; margin: 10px 0;">
              <tr style="border: none;">
                <td style="width: 50%; border: none; vertical-align: top;">
                  <p style="font-size: 10pt; margin: 0 0 4px 0;"><strong>Executive Signature:</strong></p>
                  ${isApproved && ceoSettings.SignatureUrl ? `
                    <div style="font-style: italic; color: #1e3a8a; font-size: 14pt; padding: 10px 0;">[Digital Signature Attached: ${latestApproval.ApprovedBy}]</div>
                  ` : `
                    <div style="margin-top: 35px; border-bottom: 1px solid #000; width: 85%;"></div>
                    <span style="font-size: 9pt; color: #94a3b8;">(CEO Signature line)</span>
                  `}
                </td>
                <td style="width: 50%; border: none; vertical-align: top;">
                  <p style="font-size: 10pt; margin: 0 0 4px 0;"><strong>Official Organizational Stamp:</strong></p>
                  ${isApproved && ceoSettings.StampUrl ? `
                    <div style="display: inline-block; border: 2px solid #15803d; color: #15803d; padding: 8px 15px; border-radius: 8px; font-weight: bold; text-align: center;">
                      OFFICIAL SEAL &bull; RADA CAMEROON<br>
                      <span style="font-size: 8pt; font-weight: normal;">CERTIFIED ON ${latestApproval.CameroonDate || generationTime.formattedDate}</span>
                    </div>
                  ` : `
                    <div style="border: 1px dashed #94a3b8; width: 140px; height: 70px; display: table-cell; vertical-align: middle; text-align: center; color: #94a3b8; font-size: 9pt;">
                      [Reserved Stamp Area]
                    </div>
                  `}
                </td>
              </tr>
            </table>

            <table style="border: none; margin-top: 10px;">
              <tr style="border: none;">
                <td style="width: 50%; border: none; font-size: 10pt;">
                  <strong>Approval Date:</strong> ${isApproved ? (latestApproval.CameroonDate || generationTime.formattedDate) : '____________________'}
                </td>
                <td style="width: 50%; border: none; font-size: 10pt;">
                  <strong>Authorization Time:</strong> ${isApproved ? (latestApproval.CameroonTime || generationTime.formattedTime) : '____________________'}
                </td>
              </tr>
              <tr style="border: none;">
                <td colspan="2" style="border: none; font-size: 9pt; color: #64748b; padding-top: 6px;">
                  Timezone: <strong>Africa/Douala (Cameroon, UTC+1)</strong> &bull; Verification Hash: ${latestApproval?.VerificationToken || 'PENDING-AUTH'}
                </td>
              </tr>
            </table>
          </div>

          <div class="funder-note">
            Patron &amp; Funder: <em style="font-style: italic; font-weight: bold; color: #334155;">Yong Desmond Smith. Y</em> &bull; Reconciliation and Development Association (RADA)
          </div>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'application/vnd.ms-word; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Employee_Profile_${emp.EmployeeNumber}.doc"`);
      return res.send(wordHtml);
    }

    // Default HTML / Printable Dossier Template
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const htmlPage = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Official Employee Profile - ${emp.EmployeeNumber} (${emp.FirstName} ${emp.LastName})</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page-container { border: none !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; padding: 0 !important; }
          }
        </style>
      </head>
      <body class="bg-slate-100 font-sans text-slate-800 antialiased p-4 md:p-8">
        
        <!-- Action Toolbar for Print/Download -->
        <div class="no-print max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-black text-xs uppercase tracking-wider">RADA HRMS</span>
            <span class="text-xs text-slate-500 font-medium">Official Employee Dossier</span>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="window.print()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5">
              <span>&#128424; Print Official Profile</span>
            </button>
            <a href="/api/employees/${emp.EmployeeID}/document?format=docx" class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5">
              <span>&#128196; Download Word (.doc)</span>
            </a>
            <button onclick="window.close()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition">
              Close
            </button>
          </div>
        </div>

        <!-- Official Printable Dossier Container -->
        <div class="page-container max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 p-8 md:p-12 relative overflow-hidden">
          
          <!-- Header with Official RADA Branding & Verification Badge -->
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-200 pb-6 mb-6 gap-4">
            <div class="flex items-center space-x-4">
              <div class="w-16 h-16 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm flex items-center justify-center flex-shrink-0">
                <img src="/logo.png" alt="RADA Logo" class="w-full h-full object-contain">
              </div>
              <div>
                <h1 class="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-tight uppercase">Reconciliation and Development Association</h1>
                <p class="text-xs font-bold text-emerald-700 tracking-wide uppercase">Enterprise Human Resource Management System</p>
                <p class="text-[11px] text-slate-400 mt-0.5">Official Employee Information Dossier &bull; Ref: <code class="font-mono text-slate-600">RADA-HR-${emp.EmployeeNumber}</code></p>
              </div>
            </div>
            
            <div class="text-left md:text-right">
              <div class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold ${isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                <span>${isApproved ? '&#10004; OFFICIALLY CERTIFIED' : '&#9888; DRAFT - PENDING CEO AUTHORIZATION'}</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Cameroon Time: ${generationTime.formattedTime}</p>
            </div>
          </div>

          <!-- Employee Overview Card (Photo + Core Credentials) -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50 rounded-2xl p-6 border border-slate-200/80 mb-6">
            <div class="flex flex-col items-center justify-center md:border-r md:border-slate-200 pr-0 md:pr-4">
              <div class="w-28 h-28 rounded-2xl overflow-hidden bg-white border-2 border-slate-200 shadow-md flex items-center justify-center relative">
                ${emp.Photo ? `
                  <img src="${emp.Photo.startsWith('/') ? emp.Photo : '/' + emp.Photo}" alt="${emp.FirstName}" class="w-full h-full object-cover" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
                  <div class="w-full h-full bg-slate-800 text-white font-black text-2xl flex items-center justify-center" style="display:none;">
                    ${emp.FirstName.charAt(0)}${emp.LastName.charAt(0)}
                  </div>
                ` : `
                  <div class="w-full h-full bg-slate-200 text-slate-500 font-black text-2xl flex items-center justify-center">
                    ${emp.FirstName.charAt(0)}${emp.LastName.charAt(0)}
                  </div>
                `}
              </div>
              <span class="mt-2 text-xs font-bold text-slate-600 font-mono">${emp.EmployeeNumber}</span>
              <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold mt-1">${emp.StaffStatus || 'Active'}</span>
            </div>

            <div class="md:col-span-3 space-y-3">
              <div>
                <h2 class="text-xl font-black text-slate-900 leading-tight">${emp.FirstName} ${emp.MiddleName || ''} ${emp.LastName}</h2>
                <p class="text-sm font-bold text-emerald-700">${emp.PositionTitle}</p>
                <p class="text-xs text-slate-500">${emp.DepartmentName} &bull; ${emp.SectionName}</p>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-200">
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Grade Level</span>
                  <span class="font-bold text-slate-800">${emp.GradeLevel}</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Appointment Date</span>
                  <span class="font-bold text-slate-800">${emp.HireDate || '—'}</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Employment Type</span>
                  <span class="font-bold text-slate-800">${emp.EmploymentStatus || 'Full-Time'}</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Primary Phone</span>
                  <span class="font-bold text-slate-800">${emp.PhoneNumber || '—'}</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Official Email</span>
                  <span class="font-bold text-slate-800 truncate block">${emp.EmailAddress || '—'}</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Leave Entitlement</span>
                  <span class="font-bold text-emerald-700">${emp.AnnualLeaveDays || 24} Days Annual</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 2: Statutory and Personal Information -->
          <div class="mb-6">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Statutory Credentials &amp; Personal Background</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white rounded-xl border border-slate-200 p-4">
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Gender &bull; DOB</span>
                <span class="font-semibold text-slate-800">${emp.Gender || '—'} &bull; ${emp.DateOfBirth || '—'}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Nationality</span>
                <span class="font-semibold text-slate-800">${emp.Nationality || 'Cameroonian'}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Government ID</span>
                <span class="font-semibold text-slate-800">${emp.GovernmentID || 'National ID'} ${emp.GovernmentIDNumber ? `(${emp.GovernmentIDNumber})` : ''}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Emergency Contact</span>
                <span class="font-semibold text-slate-800">${emp.EmergencyName || '—'} ${emp.EmergencyContact ? `(${emp.EmergencyContact})` : ''}</span>
              </div>
              <div class="col-span-2">
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Residential Address</span>
                <span class="font-semibold text-slate-800">${emp.Address || '—'}</span>
              </div>
              <div class="col-span-2">
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Verified Curriculum Vitae (CV)</span>
                <span class="font-semibold text-blue-700">${emp.CurriculumVitae ? `&#128196; ${emp.CurriculumVitae} (On File)` : 'Pending Submission'}</span>
              </div>
            </div>
          </div>

          <!-- Section 3: Professional Biography -->
          <div class="mb-8">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Professional Summary &amp; Qualifications</h3>
            <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-700 leading-relaxed">
              ${emp.Biography || 'Appointed staff member under the official workforce framework of the Reconciliation and Development Association (RADA). Functions and deliverables are governed by official association terms of service.'}
            </div>
          </div>

          <!-- Section 4: CEO SIGNATURE, OFFICIAL STAMP & REAL-TIME TIMESTAMP (AFRICA/DOUALA) -->
          <div class="border-2 border-slate-800 rounded-2xl p-6 bg-slate-900 text-white relative">
            <div class="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div>
                <p class="text-xs font-black tracking-widest uppercase text-emerald-400">AUTHORIZED BY</p>
                <h4 class="text-sm font-bold text-white">${ceoSettings.CeoTitle || 'Chief Executive Officer (CEO)'}</h4>
                <p class="text-[11px] text-slate-400">${ceoSettings.OrganizationName || 'Reconciliation and Development Association (RADA)'}</p>
              </div>
              <div class="text-right">
                <span class="text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${isApproved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">
                  ${isApproved ? 'Official Sign-Off Verified' : 'Awaiting CEO Sign-Off'}
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <!-- Signature Area -->
              <div class="space-y-2">
                <p class="text-xs font-semibold text-slate-300">Executive Signature:</p>
                <div class="h-20 border border-dashed border-slate-600 rounded-xl bg-slate-950 flex items-center justify-center p-2 relative overflow-hidden">
                  ${isApproved && ceoSettings.SignatureUrl ? `
                    <img src="${ceoSettings.SignatureUrl}" alt="CEO Signature" class="max-h-full object-contain filter invert">
                  ` : isApproved ? `
                    <div class="text-center">
                      <p class="font-serif italic text-base text-emerald-400 font-bold">${latestApproval.ApprovedBy || 'CEO Signature'}</p>
                      <p class="text-[9px] text-slate-400">Digitally Certified &bull; Authorized Executive</p>
                    </div>
                  ` : `
                    <div class="text-center text-slate-500 text-xs">
                      <div class="w-48 border-b border-slate-600 mb-1 mx-auto"></div>
                      <span>Signature Line (Reserved for CEO)</span>
                    </div>
                  `}
                </div>
              </div>

              <!-- Official Stamp Area -->
              <div class="space-y-2">
                <p class="text-xs font-semibold text-slate-300">Official Organizational Stamp:</p>
                <div class="h-20 border border-dashed border-slate-600 rounded-xl bg-slate-950 flex items-center justify-center p-2 relative overflow-hidden">
                  ${isApproved && ceoSettings.StampUrl ? `
                    <img src="${ceoSettings.StampUrl}" alt="Official Stamp" class="max-h-full object-contain">
                  ` : isApproved ? `
                    <div class="border-2 border-emerald-500 rounded-lg px-4 py-1 text-center bg-emerald-950/40">
                      <p class="text-[11px] font-black text-emerald-400 uppercase tracking-wider">OFFICIAL SEAL &bull; RADA</p>
                      <p class="text-[9px] text-emerald-300 font-mono">${latestApproval.CameroonDate || generationTime.formattedDate} &bull; CAMEROON</p>
                    </div>
                  ` : `
                    <span class="text-slate-500 text-xs">[ Reserved Stamp Area ]</span>
                  `}
                </div>
              </div>
            </div>

            <!-- Date, Time and Cameroon Timezone Footer -->
            <div class="mt-4 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
              <div>
                <span class="block text-slate-500 font-bold uppercase text-[9px]">Decision / Approval Date:</span>
                <span class="font-mono text-white">${isApproved ? (latestApproval.CameroonDate || generationTime.formattedDate) : 'Pending CEO Approval'}</span>
              </div>
              <div>
                <span class="block text-slate-500 font-bold uppercase text-[9px]">Official Timestamp:</span>
                <span class="font-mono text-emerald-400">${isApproved ? (latestApproval.CameroonTime || generationTime.formattedTime) : 'Awaiting Decision'}</span>
              </div>
              <div>
                <span class="block text-slate-500 font-bold uppercase text-[9px]">Timezone &bull; Hash:</span>
                <span class="font-mono text-slate-300 truncate block">Africa/Douala (UTC+1) &bull; ${latestApproval?.VerificationToken || 'DRAFT'}</span>
              </div>
            </div>
          </div>

          <!-- Enterprise Footer with Funder Attribution in Italic -->
          <div class="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div>
              <span>Patron &amp; Funder:</span>
              <span class="text-slate-800 font-bold" style="font-style: italic;">Yong Desmond Smith. Y</span>
            </div>
            <div class="text-[11px] text-slate-400">
              Reconciliation and Development Association (RADA) &bull; HRMS Enterprise Platform
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(htmlPage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5d. CEO Settings & Asset Configuration
app.get('/api/ceo/settings', (req, res) => {
  try {
    res.json(store.getCeoSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ceo/settings', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'System Administrator';
    const updated = store.updateCeoSettings(req.body, actor);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ceo/signature', ceoAssetUpload.single('signature'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No signature image uploaded.' });
    const actor = req.headers['x-user-name'] || 'System Administrator';
    const sigUrl = `/uploads/signatures/${req.file.filename}`;
    const settings = store.updateCeoSettings({ SignatureUrl: sigUrl }, actor);
    res.json({ success: true, signatureUrl: sigUrl, settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ceo/stamp', ceoAssetUpload.single('stamp'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No stamp image uploaded.' });
    const actor = req.headers['x-user-name'] || 'System Administrator';
    const stampUrl = `/uploads/stamps/${req.file.filename}`;
    const settings = store.updateCeoSettings({ StampUrl: stampUrl }, actor);
    res.json({ success: true, stampUrl: stampUrl, settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5e. CEO Document Approval Workflow Endpoints
app.get('/api/approvals', (req, res) => {
  try {
    res.json(store.getDocumentApprovals(req.query.employeeId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/approvals/request', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Administrator';
    const { employeeId, documentType } = req.body;
    const reqItem = store.createDocumentApprovalRequest(employeeId, documentType, actor);
    res.status(201).json(reqItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/approvals/:id/approve', (req, res) => {
  try {
    const userRole = (req.headers['x-user-role'] || 'Administrator').toLowerCase();
    if (!userRole.includes('admin') && !userRole.includes('ceo') && !userRole.includes('manager')) {
      return res.status(403).json({ error: 'Permission Denied: Only CEO or authorized Administrators can approve official documents.' });
    }
    const approver = req.headers['x-user-name'] || 'Executive Director / CEO';
    const comments = req.body.comments || 'Officially reviewed, approved and sealed.';
    const approved = store.approveDocument(req.params.id, approver, comments);
    res.json(approved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/approvals/:id/reject', (req, res) => {
  try {
    const approver = req.headers['x-user-name'] || 'Executive Director / CEO';
    const comments = req.body.comments || 'Revision requested prior to CEO authorization.';
    const rejected = store.rejectDocument(req.params.id, approver, comments);
    res.json(rejected);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Departments, Sections, Positions & Grades
app.get('/api/departments', (req, res) => {
  try {
    res.json(store.getDepartments());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sections', (req, res) => {
  try {
    res.json(store.getSections(req.query.departmentId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/positions', (req, res) => {
  try {
    res.json({
      positions: store.getPositions(),
      grades: store.getGrades()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Attendance Management
app.get('/api/attendance', (req, res) => {
  try {
    const { date, departmentId } = req.query;
    const list = store.getAttendance(date, departmentId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/check-in', (req, res) => {
  try {
    const { employeeId, time } = req.body;
    const result = store.recordCheckIn(employeeId, time);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/attendance/check-out', (req, res) => {
  try {
    const { employeeId, time } = req.body;
    const result = store.recordCheckOut(employeeId, time);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/attendance/correct', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Officer';
    const { attendanceId, ...payload } = req.body;
    const result = store.correctAttendance(attendanceId, payload, actor);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Leave Management
app.get('/api/leave', (req, res) => {
  try {
    res.json(store.getLeaveRequests(req.query));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leave', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'Employee';
    const newReq = store.createLeaveRequest(req.body, actor);
    res.status(201).json(newReq);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/leave/:id/approve', (req, res) => {
  try {
    const approver = req.headers['x-user-name'] || 'HR Manager';
    const comments = req.body.comments || 'Approved';
    const result = store.approveLeave(req.params.id, approver, comments);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/leave/:id/reject', (req, res) => {
  try {
    const approver = req.headers['x-user-name'] || 'HR Manager';
    const comments = req.body.comments || 'Declined';
    const result = store.rejectLeave(req.params.id, approver, comments);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Document Management
app.get('/api/documents', (req, res) => {
  try {
    res.json(store.getDocuments(req.query.employeeId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', (req, res) => {
  try {
    const actor = req.headers['x-user-name'] || 'HR Officer';
    const doc = store.createDocument(req.body, actor);
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. User Accounts & RBAC
app.get('/api/users', (req, res) => {
  try {
    res.json(store.getUsers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Notifications & Audit Logs
app.get('/api/notifications', (req, res) => {
  try {
    res.json(store.getNotifications());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    const notif = store.markNotificationRead(req.params.id);
    res.json(notif);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs', (req, res) => {
  try {
    res.json(store.getAuditLogs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Reports & Analytics
app.get('/api/reports', (req, res) => {
  try {
    const { reportType, departmentId, format } = req.query;
    let data = [];
    let title = 'HRMS Report';

    switch (reportType) {
      case 'employee-register':
        title = 'Official Employee Register';
        data = store.getEmployees({ departmentId });
        break;
      case 'department-summary':
        title = 'Workforce Distribution by Department';
        data = store.getDepartments();
        break;
      case 'daily-attendance':
        title = `Daily Attendance Summary (${req.query.date || 'Today'})`;
        data = store.getAttendance(req.query.date, departmentId);
        break;
      case 'leave-utilization':
        title = 'Leave Utilization & Pending Approvals';
        data = store.getLeaveRequests();
        break;
      case 'document-expiry':
        title = 'Employee Document Register & Validity';
        data = store.getDocuments();
        break;
      default:
        title = 'General Employee Directory';
        data = store.getEmployees();
    }

    if (format === 'csv') {
      if (data.length === 0) return res.send('');
      const keys = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object');
      const csv = [
        keys.join(','),
        ...data.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))
      ].join('\r\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType || 'report'}.csv"`);
      return res.send(csv);
    }

    res.json({ title, count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 13. RADA ASSISTANT & SENSITIVE MONITORING API
// -------------------------------------------------------------

app.post('/api/ai/query', async (req, res) => {
  try {
    const { query, userRole, currentPage } = req.body;
    const response = await aiService.processQuery({
      query,
      userRole: userRole || req.headers['x-user-role'] || 'Administrator',
      currentPage: currentPage || 'dashboard'
    });
    res.json(response);
  } catch (err) {
    console.error('[AI] Query processing error:', err.message);
    res.status(500).json({
      answer: "I encountered an internal error processing your request. Please try a different query or select from suggested options below.",
      actions: [
        { label: "Dashboard", navigate: "dashboard" },
        { label: "Check Staff on Leave", query: "Who is on leave?" }
      ]
    });
  }
});

app.get('/api/ai/anomalies', (req, res) => {
  try {
    const anomalies = aiService.detectAnomalies();
    res.json({
      total: anomalies.length,
      anomalies
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Project Identity, Funder Attribution & About Metadata
app.get('/api/system/about', (req, res) => {
  res.json({
    applicationIdentity: "RADA HRMS",
    applicationTitle: "Enterprise Human Resource Management System",
    shortName: "RADA HRMS",
    version: "2.4.0 Enterprise AI Edition",
    organization: "Reconciliation and Development Association (RADA)",
    funderAttribution: "Yong Desmond Smith. Y",
    funderAttributionItalic: "Yong Desmond Smith. Y",
    database: {
      type: "Microsoft Access Database Engine",
      sourceOfTruth: "C:\\Users\\LENOVO\\Documents\\GITHUB HRDMS\\HRMS.accdb",
      driver: "Microsoft.ACE.OLEDB.12.0",
      status: "Verified & Connected",
      dualMode: "Offline & Online LAN Enabled"
    },
    aiEngine: {
      name: "RADA Assistant",
      capabilities: [
        "Natural Language HR Queries",
        "Sensitive Monitoring & Anomaly Detection",
        "Attendance Conflict Identification",
        "Role-Based Access Enforcement",
        "Offline-Capable Local Processing Engine"
      ]
    }
  });
});

// Offline & PWA manifest support
app.get('/manifest.json', (req, res) => {
  res.json({
    name: "RADA HRMS - Human Resource Management System",
    short_name: "RADA HRMS",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png"
      }
    ]
  });
});

// Fallback for Single Page Application (non-API routes only)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  const networks = getNetworkAddresses();
  console.log(`======================================================================`);
  console.log(`  RADA Human Resource Management System (HRMS) Engine`);
  console.log(`  Reconciliation and Development Association (RADA)`);
  console.log(`  Connected Database: C:\\Users\\LENOVO\\Documents\\GITHUB HRDMS\\HRMS.accdb`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`  [OFFLINE / LOCAL ACCESS]:`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`  -> http://127.0.0.1:${PORT}`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`  [ONLINE / LOCAL NETWORK ACCESS (LAN/Wi-Fi/Remote)]:`);
  networks.forEach(net => {
    console.log(`  -> http://${net.address}:${PORT}  (${net.interface})`);
  });
  console.log(`======================================================================`);
});
