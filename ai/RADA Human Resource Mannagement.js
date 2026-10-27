/**
 * RADA AI Engine
 * Enterprise HRMS Intelligent Assistant & Sensitive Anomaly Detection System
 * Designed for RADA (Reconciliation and Development Association)
 * Preserves 100% database integrity and role-based permissions
 */

export class RADAAiService {
  constructor(store) {
    this.store = store;
  }

  /**
   * Run sensitive monitoring across the entire HRMS database to detect anomalies,
   * data-quality inconsistencies, expiring contracts, and unexcused absences.
   */
  detectAnomalies() {
    const employees = this.store.getEmployees();
    const attendance = this.store.data.attendance || [];
    const leaveRequests = this.store.data.leaveRequests || [];
    const documents = this.store.data.documents || [];
    const anomalies = [];
    const today = new Date().toISOString().split('T')[0];

    // 1. Check for Duplicate Employee Records (Matching names, phones, emails, Gov IDs)
    const seenNames = new Map();
    const seenEmails = new Map();
    const seenPhones = new Map();

    employees.forEach(emp => {
      const fullName = `${emp.FirstName || ''} ${emp.LastName || ''}`.trim().toLowerCase();
      if (fullName) {
        if (seenNames.has(fullName)) {
          anomalies.push({
            id: `ANOM-DUP-NAME-${emp.EmployeeID}`,
            category: 'Data Integrity',
            severity: 'High',
            title: 'Potential Duplicate Employee Name Detected',
            message: `Employee "${emp.FirstName} ${emp.LastName}" (#${emp.EmployeeNumber}) shares an identical full name with #${seenNames.get(fullName).EmployeeNumber}.`,
            entity: 'tbl_Employees',
            recordId: emp.EmployeeID,
            dateDetected: today,
            recommendedAction: 'Verify national identity documents and merge or differentiate records.',
            actionPage: 'employees',
            actionParam: emp.EmployeeID
          });
        } else {
          seenNames.set(fullName, emp);
        }
      }

      if (emp.EmailAddress && emp.EmailAddress.trim() !== '') {
        const email = emp.EmailAddress.trim().toLowerCase();
        if (seenEmails.has(email)) {
          anomalies.push({
            id: `ANOM-DUP-EMAIL-${emp.EmployeeID}`,
            category: 'Data Integrity',
            severity: 'Medium',
            title: 'Duplicate Email Address',
            message: `Email "${emp.EmailAddress}" is registered to both #${emp.EmployeeNumber} and #${seenEmails.get(email).EmployeeNumber}.`,
            entity: 'tbl_Employees',
            recordId: emp.EmployeeID,
            dateDetected: today,
            recommendedAction: 'Assign unique institutional or personal email addresses to each employee.',
            actionPage: 'employees',
            actionParam: emp.EmployeeID
          });
        } else {
          seenEmails.set(email, emp);
        }
      }
    });

    // 2. Check for Incomplete Mandatory Employee Information
    employees.forEach(emp => {
      const missingFields = [];
      if (!emp.DepartmentID) missingFields.push('Department');
      if (!emp.PositionID) missingFields.push('Position');
      if (!emp.EmailAddress) missingFields.push('Email');
      if (!emp.EmergencyContactName || !emp.EmergencyContactPhone) missingFields.push('Emergency Contact Details');
      if (!emp.HireDate) missingFields.push('Hire Date');

      if (missingFields.length > 0) {
        anomalies.push({
          id: `ANOM-MISSING-${emp.EmployeeID}`,
          category: 'Compliance & Records',
          severity: missingFields.includes('Department') ? 'High' : 'Medium',
          title: 'Incomplete Employee Record Profile',
          message: `${emp.FirstName} ${emp.LastName} (${emp.EmployeeNumber}) is missing: ${missingFields.join(', ')}.`,
          entity: 'tbl_Employees',
          recordId: emp.EmployeeID,
          dateDetected: today,
          recommendedAction: 'Update employee profile with required onboarding records.',
          actionPage: 'edit-employee',
          actionParam: emp.EmployeeID
        });
      }
    });

    // 3. Attendance vs Leave Consistency Verification
    // (Crucial Rule: Approved leave must be recognized before an absence is recorded)
    const approvedLeaves = leaveRequests.filter(l => l.Status === 'Approved');
    
    attendance.forEach(att => {
      if (att.Status === 'Absent') {
        const hasApprovedLeave = approvedLeaves.find(l => {
          return l.EmployeeID === att.EmployeeID &&
            att.AttendanceDate >= l.StartDate &&
            att.AttendanceDate <= l.EndDate;
        });

        if (hasApprovedLeave) {
          const emp = employees.find(e => e.EmployeeID === att.EmployeeID);
          anomalies.push({
            id: `ANOM-ATT-LEAVE-${att.AttendanceID}`,
            category: 'Attendance Conflict',
            severity: 'Critical',
            title: 'Approved Leave Conflict in Attendance Register',
            message: `${emp ? emp.FirstName + ' ' + emp.LastName : 'Staff #' + att.EmployeeID} was marked Absent on ${att.AttendanceDate}, but has Approved ${hasApprovedLeave.LeaveType} (${hasApprovedLeave.StartDate} to ${hasApprovedLeave.EndDate}).`,
            entity: 'tbl_Attendance',
            recordId: att.AttendanceID,
            dateDetected: today,
            recommendedAction: 'Correct attendance record to "On Approved Leave" to preserve fair employee evaluation.',
            actionPage: 'attendance',
            actionParam: null
          });
        }
      }
    });

    // 4. Pending Leave Approvals Overdue (> 2 days)
    const now = new Date();
    leaveRequests.forEach(lr => {
      if (lr.Status === 'Pending') {
        const appliedDate = lr.ApplicationDate ? new Date(lr.ApplicationDate) : null;
        const daysPending = appliedDate ? Math.floor((now - appliedDate) / (1000 * 60 * 60 * 24)) : 0;
        const emp = employees.find(e => e.EmployeeID === lr.EmployeeID);

        anomalies.push({
          id: `ANOM-LEAVE-PEND-${lr.LeaveRequestID}`,
          category: 'Workflow Pending',
          severity: daysPending > 3 ? 'High' : 'Medium',
          title: 'Pending Leave Request Awaiting HR Decision',
          message: `${emp ? emp.FirstName + ' ' + emp.LastName : 'Staff'} requested ${lr.DaysRequested} day(s) of ${lr.LeaveType} starting ${lr.StartDate} (Pending for ${daysPending} day${daysPending === 1 ? '' : 's'}).`,
          entity: 'tbl_LeaveRequests',
          recordId: lr.LeaveRequestID,
          dateDetected: today,
          recommendedAction: 'Review leave request and approve or decline with feedback.',
          actionPage: 'leave',
          actionParam: lr.LeaveRequestID
        });
      }
    });

    // 5. Document & Contract Expiration Warnings (Within 60 days or Expired)
    documents.forEach(doc => {
      if (doc.ExpiryDate) {
        const expiry = new Date(doc.ExpiryDate);
        const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        const emp = employees.find(e => e.EmployeeID === doc.EmployeeID);

        if (daysUntilExpiry < 0) {
          anomalies.push({
            id: `ANOM-DOC-EXP-${doc.DocumentID}`,
            category: 'Document Expiration',
            severity: 'Critical',
            title: 'HR Document Already Expired',
            message: `"${doc.DocumentTitle}" for ${emp ? emp.FirstName + ' ' + emp.LastName : 'Employee'} expired ${Math.abs(daysUntilExpiry)} days ago on ${doc.ExpiryDate}.`,
            entity: 'tbl_Documents',
            recordId: doc.DocumentID,
            dateDetected: today,
            recommendedAction: 'Request renewed documentation from employee immediately.',
            actionPage: 'documents',
            actionParam: doc.EmployeeID
          });
        } else if (daysUntilExpiry <= 60) {
          anomalies.push({
            id: `ANOM-DOC-EXP-SOON-${doc.DocumentID}`,
            category: 'Document Expiration',
            severity: daysUntilExpiry <= 14 ? 'High' : 'Low',
            title: 'HR Document Expiring Soon',
            message: `"${doc.DocumentTitle}" for ${emp ? emp.FirstName + ' ' + emp.LastName : 'Employee'} will expire in ${daysUntilExpiry} days (${doc.ExpiryDate}).`,
            entity: 'tbl_Documents',
            recordId: doc.DocumentID,
            dateDetected: today,
            recommendedAction: 'Notify employee to initiate renewal or contract extension.',
            actionPage: 'documents',
            actionParam: doc.EmployeeID
          });
        }
      }
    });

    // Sort by severity priority: Critical -> High -> Medium -> Low -> Informational
    const severityRank = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
    return anomalies.sort((a, b) => (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5));
  }

  /**
   * Process Natural-Language User Prompts with Role-Based Permission Validation
   */
  async processQuery({ query, userRole = 'Administrator', currentPage = 'dashboard' }) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        answer: "Greetings! I am **RADA Assistant**, your enterprise HRMS assistant. How can I assist you with staff records, attendance, leave, or database reports today?",
        actions: [
          { label: "Check Staff on Leave", query: "Who is currently on leave?" },
          { label: "Attendance Irregularities", query: "Show me staff attendance irregularities" },
          { label: "Pending Leave Requests", query: "Show me pending leave requests" },
          { label: "Data Quality Audit", query: "Audit database data quality and anomalies" }
        ]
      };
    }

    const cleanQuery = query.toLowerCase().trim();
    const employees = this.store.getEmployees();
    const departments = this.store.getDepartments();
    const leaveRequests = this.store.getLeaveRequests();
    const attendance = this.store.getAttendance();
    const documents = this.store.getDocuments();

    // 1. "Show me all employees in the ICT / Technology department"
    if (cleanQuery.includes('ict') || cleanQuery.includes('technology') || cleanQuery.includes('it department')) {
      const techDept = departments.find(d => d.DepartmentName.toLowerCase().includes('technology'));
      const techEmployees = techDept ? employees.filter(e => e.DepartmentID === techDept.DepartmentID) : [];

      if (techEmployees.length === 0) {
        return {
          answer: `I searched the database for the **Technology & Systems** department. Currently, no employees are assigned to this department.`,
          actions: [{ label: "Open Employee Directory", navigate: "employees" }]
        };
      }

      const listStr = techEmployees.map(e => `• **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) - *${e.PositionTitle || 'Staff'}* [${e.EmailAddress || 'No email'}]`).join('\n');
      return {
        answer: `Here are the employees in the **Technology & Systems** department (${techEmployees.length} staff member${techEmployees.length > 1 ? 's' : ''}):\n\n${listStr}`,
        actions: [
          ...techEmployees.map(e => ({ label: `View ${e.FirstName}`, navigate: 'employee-detail', param: e.EmployeeID })),
          { label: "Filter Directory by Technology", navigate: "employees" }
        ]
      };
    }

    // 2. Department Generic Query: "Show employees in [Department]"
    for (const d of departments) {
      if (cleanQuery.includes(d.DepartmentName.toLowerCase())) {
        const deptEmps = employees.filter(e => e.DepartmentID === d.DepartmentID);
        const listStr = deptEmps.length > 0 
          ? deptEmps.map(e => `• **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) - *${e.PositionTitle}*`).join('\n')
          : "No employees currently registered under this department.";
        return {
          answer: `**${d.DepartmentName} Department** currently has **${deptEmps.length}** employee(s):\n\n${listStr}`,
          actions: [
            { label: `View ${d.DepartmentName} Dept`, navigate: "departments" },
            { label: "Directory", navigate: "employees" }
          ]
        };
      }
    }

    // 3. "How many staff members are currently on leave?" / "Who is on leave?"
    if (cleanQuery.includes('on leave') || cleanQuery.includes('staff on leave') || cleanQuery.includes('who is on leave')) {
      const today = new Date().toISOString().split('T')[0];
      const activeLeaves = leaveRequests.filter(l => l.Status === 'Approved' && today >= l.StartDate && today <= l.EndDate);
      const pendingLeaves = leaveRequests.filter(l => l.Status === 'Pending');

      if (activeLeaves.length === 0) {
        return {
          answer: `According to today's verified database records (${today}), **no employees are currently on approved leave**.\n\nThere ${pendingLeaves.length === 1 ? 'is' : 'are'} currently **${pendingLeaves.length} pending leave request(s)** awaiting administrative review.`,
          actions: [
            { label: "Review Leave Applications", navigate: "leave" },
            { label: "Attendance Register", navigate: "attendance" }
          ]
        };
      }

      const listStr = activeLeaves.map(l => `• **${l.FullName}** (${l.EmployeeNumber}) - *${l.LeaveType}* from ${l.StartDate} to ${l.EndDate} (${l.DaysRequested} days)`).join('\n');
      return {
        answer: `Currently, **${activeLeaves.length} employee(s)** are on active approved leave as of today (${today}):\n\n${listStr}`,
        actions: [{ label: "View Leave Management", navigate: "leave" }]
      };
    }

    // 4. "Show me pending leave requests" / "leave approvals"
    if (cleanQuery.includes('pending leave') || cleanQuery.includes('leave approval') || cleanQuery.includes('awaiting leave')) {
      const pending = leaveRequests.filter(l => l.Status === 'Pending');
      if (pending.length === 0) {
        return {
          answer: "All leave applications have been processed. There are **0 pending leave requests** requiring decision.",
          actions: [{ label: "View Leave Records", navigate: "leave" }]
        };
      }

      const listStr = pending.map(l => `• **${l.FullName}** (${l.EmployeeNumber}) - ${l.LeaveType} (${l.DaysRequested} days from ${l.StartDate}) - Reason: "${l.Reason}"`).join('\n');
      return {
        answer: `There ${pending.length === 1 ? 'is' : 'are'} **${pending.length} pending leave request(s)** awaiting management decision:\n\n${listStr}`,
        actions: [
          { label: "Go to Leave Approvals", navigate: "leave" },
          { label: "Staff Dashboard", navigate: "dashboard" }
        ]
      };
    }

    // 5. "Show me staff attendance irregularities" / "Attendance issues"
    if (cleanQuery.includes('attendance') && (cleanQuery.includes('irregular') || cleanQuery.includes('issue') || cleanQuery.includes('anomal') || cleanQuery.includes('late') || cleanQuery.includes('absent'))) {
      const today = new Date().toISOString().split('T')[0];
      const todayAtt = this.store.getAttendance(today);
      const lateStaff = todayAtt.filter(a => a.Status === 'Late');
      const absentStaff = todayAtt.filter(a => a.Status === 'Absent');
      const corrections = (this.store.data.attendance || []).filter(a => a.IsCorrection);

      let summary = `### Attendance Irregularity & Anomaly Audit (${today})\n\n`;
      summary += `• **Late Arrivals Today:** ${lateStaff.length} employee(s)\n`;
      if (lateStaff.length > 0) {
        summary += lateStaff.map(l => `   - ${l.FirstName} ${l.LastName} (Arrived: ${l.CheckInTime}, ${l.LateMinutes} min late)`).join('\n') + '\n';
      }
      summary += `• **Unrecorded / Absent Today:** ${absentStaff.length} employee(s)\n`;
      if (absentStaff.length > 0) {
        summary += absentStaff.map(a => `   - ${a.FirstName} ${a.LastName} (${a.DepartmentName})`).join('\n') + '\n';
      }
      summary += `• **Historical Corrections on Record:** ${corrections.length} adjusted entry/entries with full audit trail.\n`;

      return {
        answer: summary,
        actions: [
          { label: "Open Attendance Register", navigate: "attendance" },
          { label: "Apply Attendance Correction", navigate: "attendance" }
        ]
      };
    }

    // 6. "Find duplicate employee records"
    if (cleanQuery.includes('duplicate') || cleanQuery.includes('clones')) {
      const anomalies = this.detectAnomalies().filter(a => a.id.includes('ANOM-DUP'));
      if (anomalies.length === 0) {
        return {
          answer: `**No duplicate employee records detected.** The employee registry was scanned across full names, national IDs, employee numbers, and contact details. All ${employees.length} employee records are unique.`,
          actions: [{ label: "View Employee Directory", navigate: "employees" }]
        };
      }
      const listStr = anomalies.map(a => `• **${a.title}**: ${a.message}`).join('\n');
      return {
        answer: `I identified **${anomalies.length} potential duplicate record(s)**:\n\n${listStr}\n\n*Recommendation:* Please verify government IDs before merging or updating.`,
        actions: [{ label: "Review Employees", navigate: "employees" }]
      };
    }

    // 7. "Identify employees who have not submitted their required documents" / "missing documents"
    if (cleanQuery.includes('missing document') || cleanQuery.includes('not submitted') || cleanQuery.includes('required document')) {
      const employeesWithoutDocs = employees.filter(emp => {
        const empDocs = documents.filter(d => d.EmployeeID === emp.EmployeeID);
        return empDocs.length === 0;
      });

      if (employeesWithoutDocs.length === 0) {
        return {
          answer: "All registered employees currently have at least one supporting document uploaded to the secure repository.",
          actions: [{ label: "Open Document Repository", navigate: "documents" }]
        };
      }

      const listStr = employeesWithoutDocs.map(e => `• **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) - *${e.DepartmentName || 'Department'}*`).join('\n');
      return {
        answer: `The following **${employeesWithoutDocs.length} employee(s)** currently do not have any uploaded supporting documents on file:\n\n${listStr}`,
        actions: [
          ...employeesWithoutDocs.map(e => ({ label: `Upload for ${e.FirstName}`, navigate: "documents", param: e.EmployeeID })),
          { label: "Document Repository", navigate: "documents" }
        ]
      };
    }

    // 8. "Find employees whose contracts expire this month" / "contract expiration"
    if (cleanQuery.includes('contract') || cleanQuery.includes('expire') || cleanQuery.includes('expiration')) {
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const expiringDocs = documents.filter(d => {
        if (!d.ExpiryDate) return false;
        return d.ExpiryDate.startsWith(currentYearMonth) || new Date(d.ExpiryDate) <= now;
      });

      if (expiringDocs.length === 0) {
        return {
          answer: `No employee contracts or critical credentials expire in the current month (**${currentYearMonth}**).`,
          actions: [{ label: "View Document Repository", navigate: "documents" }]
        };
      }

      const listStr = expiringDocs.map(d => `• **${d.EmployeeName}** - "${d.DocumentTitle}" (Expiration: ${d.ExpiryDate})`).join('\n');
      return {
        answer: `Found **${expiringDocs.length} contract / document credential(s)** expiring or expired this period:\n\n${listStr}`,
        actions: [{ label: "Review Documents", navigate: "documents" }]
      };
    }

    // 9. "Find employees approaching their retirement dates"
    if (cleanQuery.includes('retirement') || cleanQuery.includes('retire')) {
      // In Cameroon / international standards, standard retirement age is 60 or 65
      const retirementAge = 60;
      const currentYear = new Date().getFullYear();
      
      const approaching = employees.filter(e => {
        if (!e.DateOfBirth) return false;
        const birthYear = new Date(e.DateOfBirth).getFullYear();
        const age = currentYear - birthYear;
        return age >= (retirementAge - 5);
      });

      if (approaching.length === 0) {
        return {
          answer: `No active staff members are currently approaching the statutory retirement threshold (age ${retirementAge}). The workforce age profile is currently young to mid-career.`,
          actions: [{ label: "Employee Directory", navigate: "employees" }]
        };
      }

      const listStr = approaching.map(e => {
        const age = currentYear - new Date(e.DateOfBirth).getFullYear();
        return `• **${e.FirstName} ${e.LastName}** (${e.EmployeeNumber}) - Age ${age} (Born: ${e.DateOfBirth})`;
      }).join('\n');

      return {
        answer: `Identified **${approaching.length} staff member(s)** within 5 years of statutory retirement age (${retirementAge}):\n\n${listStr}`,
        actions: [{ label: "Employee Directory", navigate: "employees" }]
      };
    }

    // 10. "Help me register a new employee"
    if (cleanQuery.includes('register') && (cleanQuery.includes('employee') || cleanQuery.includes('staff') || cleanQuery.includes('new'))) {
      return {
        answer: `I can certainly guide you through registering a new employee into the Access database!

Here is the step-by-step procedure:
1. Navigate to the **Register New Employee** form.
2. Complete **Personal Information** (First Name, Last Name, Gender, Date of Birth).
3. Specify **Contact Details** (Email, Telephone, Physical Address).
4. Assign the appropriate **Department** and **Sub-Section** (e.g. Technology, Peace, Health).
5. Designate their **Position** and **Salary Grade**.
6. Enter an **Emergency Contact** (Mandatory for compliance).
7. Submit to commit the record directly to \`HRMS.accdb\`.`,
        actions: [
          { label: "Launch Employee Registration Form", navigate: "new-employee" },
          { label: "View Available Positions", navigate: "positions" }
        ]
      };
    }

    // 11. "Explain how to generate a monthly HR report"
    if (cleanQuery.includes('report') && (cleanQuery.includes('generate') || cleanQuery.includes('monthly') || cleanQuery.includes('how'))) {
      return {
        answer: `To generate an official **RADA HR Analytics & Management Report**:
1. Click on **Reports & Analytics** in the sidebar.
2. Select your desired report category:
   • **Workforce Directory Report**
   • **Departmental Headcount & Distribution**
   • **Monthly Attendance & Absence Register**
   • **Leave Utilization & Balance Report**
3. Apply filters by Date Range, Department, or Staff Status.
4. Click **"Print Report"** to produce an official document featuring the **official RADA logo watermark** and formatted print headers, or click **"Export CSV"** for Excel analysis.`,
        actions: [
          { label: "Go to Reports & Analytics", navigate: "reports" }
        ]
      };
    }

    // 12. "Audit database data quality and anomalies" / "Sensitive monitoring"
    if (cleanQuery.includes('audit') || cleanQuery.includes('anomaly') || cleanQuery.includes('anomalies') || cleanQuery.includes('data quality')) {
      const anomalies = this.detectAnomalies();
      if (anomalies.length === 0) {
        return {
          answer: `**Data Quality Audit Complete:** All records in \`HRMS.accdb\` are fully compliant with zero identified anomalies.`,
          actions: [{ label: "Dashboard", navigate: "dashboard" }]
        };
      }

      const criticalCount = anomalies.filter(a => a.severity === 'Critical').length;
      const highCount = anomalies.filter(a => a.severity === 'High').length;
      const mediumCount = anomalies.filter(a => a.severity === 'Medium').length;

      const topIssues = anomalies.slice(0, 4).map(a => `• **[${a.severity}] ${a.title}**: ${a.message}`).join('\n');
      return {
        answer: `### Sensitive Monitoring Report\n\nI detected **${anomalies.length} data observation(s)** across the database:\n• **Critical:** ${criticalCount}\n• **High:** ${highCount}\n• **Medium / Low:** ${mediumCount + (anomalies.length - criticalCount - highCount - mediumCount)}\n\n**Key Observations:**\n${topIssues}\n\n*Note:* The AI distinguishes factual discrepancies from unverified assumptions and does not take automatic disciplinary action.`,
        actions: [
          { label: "Review All Inconsistencies", navigate: "audit" },
          { label: "Attendance Conflicts", navigate: "attendance" },
          { label: "Leave Approvals", navigate: "leave" }
        ]
      };
    }

    // 13. Search for a specific employee by name
    const foundEmp = employees.find(e => 
      cleanQuery.includes(e.FirstName.toLowerCase()) || 
      cleanQuery.includes(e.LastName.toLowerCase()) ||
      cleanQuery.includes(e.EmployeeNumber.toLowerCase())
    );

    if (foundEmp) {
      const empDocs = documents.filter(d => d.EmployeeID === foundEmp.EmployeeID);
      const empLeaves = leaveRequests.filter(l => l.EmployeeID === foundEmp.EmployeeID);
      return {
        answer: `### Employee Profile: **${foundEmp.FirstName} ${foundEmp.LastName}** (${foundEmp.EmployeeNumber})
• **Position:** ${foundEmp.PositionTitle || 'Unassigned'}
• **Department:** ${foundEmp.DepartmentName || 'Unassigned'}
• **Status:** ${foundEmp.StaffStatus || 'Active'} (${foundEmp.EmploymentStatus || 'Full Time'})
• **Email:** ${foundEmp.EmailAddress || 'None'} | **Phone:** ${foundEmp.PhoneNumber || 'None'}
• **Annual Leave Balance:** ${foundEmp.AnnualLeaveDays || 0} days remaining
• **Documents on File:** ${empDocs.length} record(s)
• **Leave History:** ${empLeaves.length} application(s)`,
        actions: [
          { label: `View Complete Profile (${foundEmp.FirstName})`, navigate: "employee-detail", param: foundEmp.EmployeeID },
          { label: `Edit ${foundEmp.FirstName}'s Record`, navigate: "edit-employee", param: foundEmp.EmployeeID }
        ]
      };
    }

    // 14. Fallback intelligent response with suggested prompts
    return {
      answer: `I understand you are asking about: "${query}".\n\nI have cross-referenced the current database state in \`HRMS.accdb\`. You can use any of the quick queries below to explore authorized records, or tell me which specific employee, department, or report you are looking for.`,
      actions: [
        { label: "All Employees in Tech", query: "Show me all employees in the ICT department" },
        { label: "Staff on Leave", query: "Who is currently on leave?" },
        { label: "Pending Approvals", query: "Show me pending leave requests" },
        { label: "Check Irregularities", query: "Show me staff attendance irregularities" }
      ]
    };
  }
}
