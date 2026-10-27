// RADA Assistant - Context-Aware HR Database Assistant & Sensitive Monitoring Engine
// Reconciliation and Development Association (RADA)
// Connects to verified database store (HRMS.accdb backed)

export class HonouredOneAiService {
  constructor(store) {
    this.store = store;
    this.name = "RADA Assistant";
  }

  // --- SENSITIVE DATA QUALITY AUDIT & ANOMALY DETECTION ---
  detectAnomalies() {
    const anomalies = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const employees = this.store.data.employees || [];
    const attendance = this.store.data.attendance || [];
    const leaves = this.store.data.leaveRequests || [];
    const approvals = this.store.data.documentApprovals || [];

    // 1. Missing Mandatory Profiles (Photo, CV, Phone, Emergency contact)
    employees.forEach(emp => {
      const missing = [];
      if (!emp.Photo) missing.push('Official Photograph');
      if (!emp.CurriculumVitae) missing.push('Curriculum Vitae (CV)');
      if (!emp.PhoneNumber) missing.push('Phone Number');
      if (!emp.EmergencyContact && !emp.EmergencyName) missing.push('Emergency Contact');
      if (!emp.DateOfBirth) missing.push('Date of Birth');

      if (missing.length > 0) {
        anomalies.push({
          severity: missing.includes('Official Photograph') || missing.includes('Curriculum Vitae (CV)') ? 'Warning' : 'Info',
          entity: `${emp.EmployeeNumber} (${emp.FirstName} ${emp.LastName})`,
          dateDetected: todayStr,
          title: `Incomplete Employee Profile Details`,
          message: `${emp.FirstName} ${emp.LastName} has missing records: ${missing.join(', ')}.`,
          recommendedAction: 'Upload missing photograph/CV or complete employee onboarding fields.',
          actionPage: 'employee-detail',
          actionParam: String(emp.EmployeeID)
        });
      }
    });

    // 2. Attendance Anomalies (Late arrivals or missing check-outs for past dates)
    attendance.forEach(att => {
      if (att.AttendanceDate < todayStr && att.CheckInTime && !att.CheckOutTime) {
        const emp = employees.find(e => e.EmployeeID === att.EmployeeID);
        anomalies.push({
          severity: 'Warning',
          entity: emp ? `${emp.EmployeeNumber} (${emp.FirstName})` : `Employee #${att.EmployeeID}`,
          dateDetected: att.AttendanceDate,
          title: `Unclosed Attendance Record (Missing Check-out)`,
          message: `Employee checked in at ${att.CheckInTime} on ${att.AttendanceDate} without a recorded check-out time.`,
          recommendedAction: 'Record an administrative attendance correction with verified departure time.',
          actionPage: 'attendance',
          actionParam: null
        });
      }

      if (att.LateMinutes && att.LateMinutes > 30) {
        const emp = employees.find(e => e.EmployeeID === att.EmployeeID);
        anomalies.push({
          severity: 'Info',
          entity: emp ? `${emp.EmployeeNumber} (${emp.FirstName})` : `Employee #${att.EmployeeID}`,
          dateDetected: att.AttendanceDate,
          title: `Significant Attendance Delay (${att.LateMinutes} mins)`,
          message: `Late arrival recorded on ${att.AttendanceDate} exceeding 30 minutes.`,
          recommendedAction: 'Review supervisor remarks or verify official justification.',
          actionPage: 'attendance',
          actionParam: null
        });
      }
    });

    // 3. Pending CEO Document Approvals
    approvals.forEach(app => {
      if (app.Status === 'Pending') {
        const emp = employees.find(e => e.EmployeeID === app.EmployeeID);
        anomalies.push({
          severity: 'Warning',
          entity: emp ? `${emp.EmployeeNumber} (${emp.FirstName})` : `Employee #${app.EmployeeID}`,
          dateDetected: app.RequestDate ? app.RequestDate.split('T')[0] : todayStr,
          title: `Document Dossier Pending CEO Authorization`,
          message: `Official document dossier requested by ${app.RequestedBy} is awaiting CEO review & signature stamp.`,
          recommendedAction: 'Authorized executive review and decision required.',
          actionPage: 'employee-detail',
          actionParam: String(app.EmployeeID)
        });
      }
    });

    // 4. Pending Leave Applications
    leaves.forEach(lr => {
      if (lr.Status === 'Pending') {
        const emp = employees.find(e => e.EmployeeID === lr.EmployeeID);
        anomalies.push({
          severity: 'Info',
          entity: emp ? `${emp.EmployeeNumber} (${emp.FirstName})` : `Employee #${lr.EmployeeID}`,
          dateDetected: lr.DateSubmitted ? lr.DateSubmitted.split('T')[0] : todayStr,
          title: `Pending Leave Application (${lr.LeaveType})`,
          message: `${emp ? emp.FirstName + ' ' + emp.LastName : 'Staff'} requested ${lr.DaysRequested} days starting ${lr.StartDate}.`,
          recommendedAction: 'HR Manager review and approval needed in Leave module.',
          actionPage: 'leave',
          actionParam: null
        });
      }
    });

    return anomalies;
  }

  // --- NATURAL LANGUAGE HR & DATABASE QUERY PROCESSOR ---
  async processQuery({ query, userRole = 'Administrator', currentPage = 'dashboard' }) {
    const q = (query || '').toLowerCase().trim();
    const employees = this.store.data.employees || [];
    const departments = this.store.data.departments || [];
    const attendance = this.store.data.attendance || [];
    const leaves = this.store.data.leaveRequests || [];
    const approvals = this.store.data.documentApprovals || [];
    const todayStr = new Date().toISOString().split('T')[0];

    // Response structure
    let answer = "";
    let actions = [];

    // 1. Department Queries (e.g. "Show me all employees in the ICT department" / "Technology")
    if (q.includes('ict') || q.includes('technology') || q.includes('tech department')) {
      const techDept = departments.find(d => d.DepartmentName.toLowerCase().includes('tech'));
      const techStaff = techDept ? employees.filter(e => e.DepartmentID === techDept.DepartmentID) : [];
      
      if (techStaff.length > 0) {
        answer = `Found **${techStaff.length} personnel** in the **Technology / ICT** department:\n\n` +
          techStaff.map(e => `* **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) — *${e.PositionTitle || 'IT Staff'}* [${e.StaffStatus || 'Active'}]`).join('\n');
      } else {
        answer = "No staff currently assigned to the Technology / ICT department.";
      }
      actions.push({ label: "Open Employee Directory", navigate: "employees" });
      return { answer, actions };
    }

    // 2. Health Department
    if (q.includes('health') || q.includes('medical')) {
      const healthDept = departments.find(d => d.DepartmentName.toLowerCase().includes('health'));
      const healthStaff = healthDept ? employees.filter(e => e.DepartmentID === healthDept.DepartmentID) : [];
      
      if (healthStaff.length > 0) {
        answer = `Found **${healthStaff.length} personnel** in the **Health** department:\n\n` +
          healthStaff.map(e => `* **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) — *${e.PositionTitle || 'Health Assistant'}* [${e.StaffStatus || 'Active'}]`).join('\n');
      } else {
        answer = "No personnel currently recorded in Health department.";
      }
      actions.push({ label: "Open Employee Directory", navigate: "employees" });
      return { answer, actions };
    }

    // 3. Staff Currently on Leave
    if (q.includes('on leave') || q.includes('who is on leave') || q.includes('currently on leave')) {
      const activeLeaves = leaves.filter(l => 
        l.Status === 'Approved' &&
        l.StartDate <= todayStr &&
        l.EndDate >= todayStr
      );

      if (activeLeaves.length > 0) {
        answer = `Currently **${activeLeaves.length} staff member(s)** are on approved leave today (${todayStr}):\n\n` +
          activeLeaves.map(l => {
            const emp = employees.find(e => e.EmployeeID === l.EmployeeID);
            return `* **${emp ? emp.FirstName + ' ' + emp.LastName : 'Staff'}** (${l.LeaveType}) — Returns on **${l.EndDate}**`;
          }).join('\n');
      } else {
        answer = `No staff members are on approved leave today (**${todayStr}**). Full workforce available.`;
      }
      actions.push({ label: "Leave Applications", navigate: "leave" });
      return { answer, actions };
    }

    // 4. Pending Leave Requests
    if (q.includes('pending leave') || q.includes('leave requests') || q.includes('pending approvals')) {
      const pending = leaves.filter(l => l.Status === 'Pending');
      if (pending.length > 0) {
        answer = `There are **${pending.length} pending leave request(s)** awaiting decision:\n\n` +
          pending.map(l => {
            const emp = employees.find(e => e.EmployeeID === l.EmployeeID);
            return `* **${emp ? emp.FirstName + ' ' + emp.LastName : 'Staff'}**: ${l.DaysRequested} days of *${l.LeaveType}* (${l.StartDate} to ${l.EndDate})`;
          }).join('\n');
      } else {
        answer = "All leave applications have been reviewed. There are **0 pending leave requests**.";
      }
      actions.push({ label: "Review Leaves", navigate: "leave" });
      return { answer, actions };
    }

    // 5. Attendance Irregularities
    if (q.includes('irregularit') || q.includes('late') || q.includes('absent') || q.includes('attendance issue')) {
      const lateRecords = attendance.filter(a => a.LateMinutes > 15 || a.Status === 'Late');
      if (lateRecords.length > 0) {
        answer = `Found **${lateRecords.length} attendance record(s)** with late check-in (>15 mins):\n\n` +
          lateRecords.slice(0, 5).map(a => {
            const emp = employees.find(e => e.EmployeeID === a.EmployeeID);
            return `* **${emp ? emp.FirstName + ' ' + emp.LastName : 'Employee'}** on ${a.AttendanceDate}: Checked in at ${a.CheckInTime} (${a.LateMinutes} mins late)`;
          }).join('\n');
      } else {
        answer = "Zero attendance irregularities recorded in active logs. All recorded check-ins are on schedule.";
      }
      actions.push({ label: "Attendance Register", navigate: "attendance" });
      return { answer, actions };
    }

    // 6. Missing Documents / Photo / CV
    if (q.includes('missing document') || q.includes('missing cv') || q.includes('no photo') || q.includes('not submitted')) {
      const missingStaff = employees.filter(e => !e.CurriculumVitae || !e.Photo);
      if (missingStaff.length > 0) {
        answer = `Found **${missingStaff.length} staff member(s)** with missing documentation:\n\n` +
          missingStaff.map(e => {
            const items = [];
            if (!e.Photo) items.push('Photograph');
            if (!e.CurriculumVitae) items.push('CV');
            return `* **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) — Missing: ${items.join(' & ')}`;
          }).join('\n');
      } else {
        answer = "All registered employees have official photographs and CVs verified on record.";
      }
      actions.push({ label: "Employee Directory", navigate: "employees" });
      return { answer, actions };
    }

    // 7. CEO Approvals / Documents
    if (q.includes('ceo') || q.includes('approval') || q.includes('signature') || q.includes('stamp')) {
      const pendingApprovals = approvals.filter(a => a.Status === 'Pending');
      const approved = approvals.filter(a => a.Status === 'Approved');
      answer = `**CEO Authorization & Official Stamp Status:**\n\n` +
        `* **Pending Review:** ${pendingApprovals.length} document dossier(s)\n` +
        `* **Approved & Certified:** ${approved.length} document(s)\n` +
        `* **Official Timezone:** Africa/Douala (Cameroon, UTC+1)\n\n` +
        `Official stamps and CEO signatures are applied strictly when an authorized executive approves the document.`;
      actions.push({ label: "View Employees", navigate: "employees" });
      return { answer, actions };
    }

    // 8. Help / Register employee
    if (q.includes('register') || q.includes('add employee') || q.includes('new employee') || q.includes('onboard')) {
      answer = "To register a new employee:\n\n" +
        "1. Click the **Register Employee** navigation link or Quick Action.\n" +
        "2. Fill in the primary details, select Department and Job Title.\n" +
        "3. Upload the employee's photograph (JPG, PNG, WebP) and CV (PDF, DOCX).\n" +
        "4. Click **Save & Register Employee** to store permanently in `HRMS.accdb`.";
      actions.push({ label: "Open Registration Form", navigate: "new-employee" });
      return { answer, actions };
    }

    // 9. Report Generation
    if (q.includes('report') || q.includes('analytics') || q.includes('export') || q.includes('download')) {
      answer = "RADA HRMS provides multiple official export and reporting options:\n\n" +
        "* **Official Employee Profile PDF:** Pixel-perfect dossier with CEO signature & official stamp.\n" +
        "* **Editable Word Document (.doc/.docx):** Comprehensive employee record.\n" +
        "* **Workforce CSV Exports:** Available in the Reports module for department & attendance rosters.";
      actions.push({ label: "Open Reports", navigate: "reports" });
      return { answer, actions };
    }

    // 10. Audit / Anomaly General Query
    if (q.includes('audit') || q.includes('data quality') || q.includes('anomal')) {
      const anomalies = this.detectAnomalies();
      answer = `Completed sensitive audit of database records. Detected **${anomalies.length} observation(s)** requiring review.\n\n` +
        anomalies.slice(0, 3).map(a => `* [${a.severity}] **${a.entity}**: ${a.title} — *${a.recommendedAction}*`).join('\n');
      actions.push({ label: "View Detailed Audit", navigate: "dashboard" });
      return { answer, actions };
    }

    // Default Fallback
    answer = `I am **RADA Assistant**, connected directly to your RADA HRMS database.\n\n` +
      `You can ask me to:\n` +
      `* Find employees by department or job role\n` +
      `* Check who is currently on leave\n` +
      `* Review pending leave or CEO approval requests\n` +
      `* Identify staff missing photographs or CVs\n` +
      `* Check attendance punctuality and irregularities\n` +
      `* Guide you through registration, PDF generation, and official stamps`;

    actions.push(
      { label: "Check Staff on Leave", query: "Who is currently on leave?" },
      { label: "Missing Documents", query: "Identify employees who have not submitted their required documents" },
      { label: "Run Data Audit", query: "Audit database data quality and anomalies" }
    );

    return { answer, actions };
  }
}
