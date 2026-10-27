# RADA Human Resource Management System (HRMS)
## Enterprise Application Built on Microsoft Access Database (`HRMS.accdb`)

### 1. Project Overview & Role
This application transforms the existing Microsoft Access database (`C:\Users\LENOVO\Documents\GITHUB HRDMS\HRMS.accdb`) into a professional, modern, secure, and fully responsive enterprise Human Resource Management System for **RADA**.

The user interface and design system are modeled after modern enterprise systems like **SAP SuccessFactors**, **BambooHR**, and **Microsoft Dynamics 365**, using an authoritative color palette:
* **Primary**: Deep Navy Blue (`#0f172a`, `#1e293b`)
* **Secondary**: Royal Blue (`#2563eb`)
* **Accent**: Emerald & Teal (`#0d9488`, `#059669`)
* **Typography**: Inter Sans-Serif
* **Cards & Shadows**: Clean white containers with subtle elevation

---

## 2. Verified Microsoft Access Database Schema

The system integrates directly with `C:\Users\LENOVO\Documents\GITHUB HRDMS\HRMS.accdb` using the 64-bit `Microsoft.ACE.OLEDB.12.0` provider.

### Core Tables & Existing Records:
1. **`tbl_Departments`** (9 records):
   * Technology, Health, Peace, Agriculture, Communication, MEAL, Finance, Fundraising, Environment Protection.
2. **`tbl_Sections`** (10 records):
   * Systems & ICT Support, Software & Data Management, Community Health Outreach, Mediation & Peace Building, Sustainable Farming Projects, Media & Public Relations, Monitoring & Evaluation, Accounting & Payroll, Donor Relations & Grants, Climate & Natural Resources.
3. **`tbl_Positions`** (9 records):
   * Executive Director, HR Manager, IT Officer/Systems Administrator, Finance & Accounts Officer, MEAL Officer, Project Coordinator, Communication Officer, Health Program Assistant, Volunteer/Intern.
4. **`tbl_Grades`** (7 records):
   * Executive/Director, Senior Management, Middle Management/Coordinator, Senior Officer/Specialist, Officer/Associate, Assistant/Junior Staff, Intern/Volunteer.
5. **`tbl_Employees`** (31 fields, 2 verified records):
   * `EMP-001`: Yong Smith.Y Desmond (IT Officer/Volunteer)
   * `EMP-002`: Fomekong Shella Christine (Health Program Assistant/Volunteer)
6. **`tbl_PositionHistory`** (Junction Table):
   * Tracks employee promotions, transfers, department re-assignments, grade progressions, and salary changes with effective dates.

---

## 3. Database Gap Analysis & Enterprise Extension Schema

To fulfill all requirements of an enterprise HRMS without corrupting or breaking existing Access tables, the following non-destructive extensions are implemented:

* **`tbl_Attendance`**: Daily register, clock-in, clock-out, late calculation, and attendance exception corrections preserving original values and justifications.
* **`tbl_LeaveRequests` & `tbl_LeaveBalances`**: Leave types, start/end dates, business day calculation (excluding weekends), overlap prevention, and approval workflow.
* **`tbl_EmployeeDocuments`**: Categories (CV, Contracts, Academic, ID, Certifications) with validity expiration tracking.
* **`tbl_Users` & `tbl_Roles`**: Role-based access control (Admin, HR Manager, HR Officer, Dept Manager, Employee) with secure session handling.
* **`tbl_AuditLogs`**: Complete chronological audit trail for all creations, modifications, attendance edits, and approvals.

---

## 4. Key HR Business Logic Implemented

### Attendance & Approved Leave Integration Rule
* An employee with **approved leave** covering a specific date is **never marked absent**. The attendance engine automatically inspects `tbl_LeaveRequests` and assigns the status **"On Approved Leave"** with a direct reference to the approved leave request.
* Unrecorded days are marked **"Unconfirmed / Pending"** instead of assuming immediate unapproved absence.
* Authorized attendance corrections preserve the original timestamp, editor identity, and reason in the audit trail.

### Leave Entitlement & Overlap Prevention
* Leave applications check against available `AnnualLeaveDays`.
* Applications automatically validate against existing pending or approved requests to prevent date collisions.
* Upon approval by an authorized HR Manager or Administrator, the balance is deducted and the employee's attendance calendar is updated.

---

## 5. How to Run the Application

The application is deployed on Drive `S:` with the workspace link at `app/`:

```powershell
# From the clever-rutherford/app directory:
node server.js
```

Open your browser to:
**`http://localhost:5000`**

### Demonstration Personas:
Click the **Role Switcher** pill at the top right of the application to instantly test:
1. **System Administrator** (`Dr. Evelyn Tah`): Full access, schema diagnostics, user permissions.
2. **HR Manager** (`Beatrice Lum`): Employee management, leave approvals, attendance adjustments.
3. **HR Officer** (`Paul Ndi`): Registrations, daily attendance tracking, document uploads.
4. **Department Manager** (`Eng. Samuel K.`): Departmental rosters and leave reviews.
5. **Employee** (`Yong Desmond`): Self profile, leave requests, individual attendance history.
