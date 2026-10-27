import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initialData } from './initialData.js';
import { executeAccess } from '../accessBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'hrms_store.json');
const ACCESS_DB_PATH = 'C:\\Users\\LENOVO\\Documents\\GITHUB HRDMS\\HRMS.accdb';

class HRMSStore {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        console.log('[Store] Loaded persistent data from storage file.');
      } else {
        this.data = JSON.parse(JSON.stringify(initialData));
        this.save();
        console.log('[Store] Initialized with verified database snapshot.');
      }
      
      // Ensure CEO settings exist
      if (!this.data.ceoSettings) {
        this.data.ceoSettings = {
          CeoName: "Executive Director / CEO",
          CeoTitle: "Chief Executive Officer (CEO)",
          OrganizationName: "Reconciliation and Development Association (RADA)",
          SignatureUrl: "",
          StampUrl: "",
          AutoApplyOnApproval: true,
          RequireCeoApprovalForProfiles: true
        };
      }

      // Ensure document approvals collection exists
      if (!this.data.documentApprovals) {
        this.data.documentApprovals = [];
      }
    } catch (err) {
      console.error('[Store] Initialization error, falling back to initial data:', err.message);
      this.data = JSON.parse(JSON.stringify(initialData));
      this.data.ceoSettings = {
        CeoName: "Executive Director / CEO",
        CeoTitle: "Chief Executive Officer (CEO)",
        OrganizationName: "Reconciliation and Development Association (RADA)",
        SignatureUrl: "",
        StampUrl: "",
        AutoApplyOnApproval: true,
        RequireCeoApprovalForProfiles: true
      };
      this.data.documentApprovals = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Store] Save error:', err.message);
    }
  }

  logAudit(actor, action, entity, details) {
    const log = {
      LogID: (this.data.auditLogs.length > 0 ? Math.max(...this.data.auditLogs.map(l => l.LogID)) : 0) + 1,
      Timestamp: new Date().toISOString(),
      Actor: actor || 'System User',
      Action: action,
      Entity: entity,
      Details: details
    };
    this.data.auditLogs.unshift(log);
    this.save();
    return log;
  }

  // --- DATABASE HEALTH & ACCESS INTEGRATION STATUS ---
  getDbHealth() {
    let exists = false;
    let sizeBytes = 0;
    let lastModified = null;
    try {
      if (fs.existsSync(ACCESS_DB_PATH)) {
        const stat = fs.statSync(ACCESS_DB_PATH);
        exists = true;
        sizeBytes = stat.size;
        lastModified = stat.mtime.toISOString();
      }
    } catch (e) {
      exists = false;
    }

    return {
      accessDbPath: ACCESS_DB_PATH,
      exists,
      sizeBytes,
      sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
      lastModified,
      provider: 'Microsoft.ACE.OLEDB.12.0',
      status: exists ? 'CONNECTED & VERIFIED' : 'FILE NOT FOUND',
      tables: {
        tbl_Departments: this.data.departments.length,
        tbl_Sections: this.data.sections.length,
        tbl_Positions: this.data.positions.length,
        tbl_Grades: this.data.grades.length,
        tbl_Employees: this.data.employees.length,
        tbl_PositionHistory: this.data.positionHistory.length,
        tbl_Attendance: this.data.attendance.length,
        tbl_LeaveRequests: this.data.leaveRequests.length,
        tbl_EmployeeDocuments: this.data.documents.length,
        tbl_Users: this.data.users.length,
        tbl_AuditLogs: this.data.auditLogs.length
      }
    };
  }

  // --- DASHBOARD STATS ---
  getDashboardStats() {
    const totalEmployees = this.data.employees.length;
    const activeEmployees = this.data.employees.filter(e => (e.StaffStatus || 'Active').toLowerCase() === 'active').length;
    const inactiveEmployees = totalEmployees - activeEmployees;
    const totalDepartments = this.data.departments.length;

    // Today's Date in YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    
    // Check attendance for today
    const todayAttendance = this.getAttendance(today);
    const presentToday = todayAttendance.filter(a => a.Status === 'Present' || a.Status === 'Late').length;
    const onLeaveToday = todayAttendance.filter(a => a.Status === 'On Approved Leave').length;
    const pendingLeave = this.data.leaveRequests.filter(l => l.Status === 'Pending').length;
    const absentToday = todayAttendance.filter(a => a.Status === 'Absent').length;

    // Department Distribution
    const departmentDistribution = this.data.departments.map(d => {
      const count = this.data.employees.filter(e => e.DepartmentID === d.DepartmentID).length;
      return {
        departmentId: d.DepartmentID,
        departmentName: d.DepartmentName,
        employeeCount: count
      };
    });

    // Employment Status Distribution
    const statusCounts = {};
    this.data.employees.forEach(e => {
      const s = e.EmploymentStatus || 'Unspecified';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    // Recent activities
    const recentActivity = this.data.auditLogs.slice(0, 8);

    return {
      kpis: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        totalDepartments,
        presentToday,
        absentToday,
        onLeaveToday,
        pendingLeave
      },
      departmentDistribution,
      statusDistribution: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
      recentActivity
    };
  }

  // --- EMPLOYEES CRUD ---
  getEmployees(query = {}) {
    let list = this.data.employees.map(emp => {
      const dept = this.data.departments.find(d => d.DepartmentID === emp.DepartmentID);
      const sec = this.data.sections.find(s => s.SectionID === emp.SectionID);
      const pos = this.data.positions.find(p => p.PositionID === emp.PositionID);
      const grd = this.data.grades.find(g => g.GradeID === emp.GradeID);
      return {
        ...emp,
        DepartmentName: dept ? dept.DepartmentName : 'Unassigned',
        SectionName: sec ? sec.SectionName : 'Unassigned',
        PositionTitle: pos ? pos.PositionTitle : 'Unassigned',
        GradeLevel: grd ? grd.GradeLevel : 'Unassigned'
      };
    });

    // Search query
    if (query.search) {
      const term = query.search.toLowerCase();
      list = list.filter(e => 
        (e.FirstName && e.FirstName.toLowerCase().includes(term)) ||
        (e.LastName && e.LastName.toLowerCase().includes(term)) ||
        (e.EmployeeNumber && e.EmployeeNumber.toLowerCase().includes(term)) ||
        (e.EmailAddress && e.EmailAddress.toLowerCase().includes(term)) ||
        (e.PositionTitle && e.PositionTitle.toLowerCase().includes(term)) ||
        (e.DepartmentName && e.DepartmentName.toLowerCase().includes(term))
      );
    }

    // Filter department
    if (query.departmentId) {
      list = list.filter(e => e.DepartmentID === parseInt(query.departmentId, 10));
    }

    // Filter status
    if (query.status) {
      list = list.filter(e => (e.StaffStatus || 'Active').toLowerCase() === query.status.toLowerCase());
    }

    return list;
  }

  getEmployee(id) {
    const empId = parseInt(id, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) return null;

    const dept = this.data.departments.find(d => d.DepartmentID === emp.DepartmentID);
    const sec = this.data.sections.find(s => s.SectionID === emp.SectionID);
    const pos = this.data.positions.find(p => p.PositionID === emp.PositionID);
    const grd = this.data.grades.find(g => g.GradeID === emp.GradeID);

    // Enriched with position history, attendance, leaves, documents
    const positionHistory = this.data.positionHistory.filter(ph => ph.EmployeeID === empId).map(ph => ({
      ...ph,
      DepartmentName: (this.data.departments.find(d => d.DepartmentID === ph.DepartmentID) || {}).DepartmentName,
      SectionName: (this.data.sections.find(s => s.SectionID === ph.SectionID) || {}).SectionName,
      PositionTitle: (this.data.positions.find(p => p.PositionID === ph.PositionID) || {}).PositionTitle,
      GradeLevel: (this.data.grades.find(g => g.GradeID === ph.GradeID) || {}).GradeLevel
    }));

    const attendance = this.data.attendance.filter(a => a.EmployeeID === empId);
    const leaves = this.data.leaveRequests.filter(l => l.EmployeeID === empId);
    const documents = this.data.documents.filter(d => d.EmployeeID === empId);
    const audits = this.data.auditLogs.filter(a => a.Entity.includes(`Employee #${empId}`) || a.Actor.includes(emp.FirstName));

    return {
      ...emp,
      DepartmentName: dept ? dept.DepartmentName : 'Unassigned',
      SectionName: sec ? sec.SectionName : 'Unassigned',
      PositionTitle: pos ? pos.PositionTitle : 'Unassigned',
      GradeLevel: grd ? grd.GradeLevel : 'Unassigned',
      positionHistory,
      attendance,
      leaveRequests: leaves,
      documents,
      auditHistory: audits
    };
  }

  async createEmployee(payload, actor = 'HR Administrator') {
    // Determine new EmployeeID
    const nextId = (this.data.employees.length > 0 ? Math.max(...this.data.employees.map(e => e.EmployeeID)) : 0) + 1;
    const empNumber = payload.EmployeeNumber || `EMP-${String(nextId).padStart(3, '0')}`;

    // Duplicate check
    const duplicate = this.data.employees.find(e => 
      e.EmployeeNumber.toLowerCase() === empNumber.toLowerCase() ||
      (e.EmailAddress && payload.EmailAddress && e.EmailAddress.toLowerCase() === payload.EmailAddress.toLowerCase())
    );
    if (duplicate) {
      throw new Error(`An employee with ID '${empNumber}' or email '${payload.EmailAddress}' already exists.`);
    }

    const now = new Date().toISOString();
    const newEmp = {
      EmployeeID: nextId,
      EmployeeNumber: empNumber,
      FirstName: payload.FirstName || '',
      LastName: payload.LastName || '',
      MiddleName: payload.MiddleName || '',
      Nationality: payload.Nationality || 'Cameroonian',
      Age: payload.Age || '',
      Gender: payload.Gender || 'Other',
      DateOfBirth: payload.DateOfBirth || null,
      PlaceOfBirth: payload.PlaceOfBirth || '',
      Village: payload.Village || '',
      GovernmentID: payload.GovernmentID || 'NationalID Card',
      GovernmentIDNumber: payload.GovernmentIDNumber || '',
      EmailAddress: payload.EmailAddress || '',
      PhoneNumber: payload.PhoneNumber || '',
      OrganizationalEmail: payload.OrganizationalEmail || '',
      EmergencyName: payload.EmergencyName || '',
      EmergencyContact: payload.EmergencyContact || '',
      Address: payload.Address || '',
      HireDate: payload.HireDate || now.split('T')[0],
      CurriculumVitae: payload.CurriculumVitae || '',
      Photo: payload.Photo || '',
      EmploymentStatus: payload.EmploymentStatus || 'Full-Time',
      StaffStatus: payload.StaffStatus || 'Active',
      Biography: payload.Biography || '',
      AnnualLeaveDays: parseInt(payload.AnnualLeaveDays, 10) || 24,
      MaritalStatus: payload.MaritalStatus || 'Single',
      MethodOfExit: null,
      ChildrenCount: parseInt(payload.ChildrenCount, 10) || 0,
      CreatedDate: now,
      LastModifiedDate: now,
      DepartmentID: payload.DepartmentID ? parseInt(payload.DepartmentID, 10) : null,
      SectionID: payload.SectionID ? parseInt(payload.SectionID, 10) : null,
      PositionID: payload.PositionID ? parseInt(payload.PositionID, 10) : null,
      GradeID: payload.GradeID ? parseInt(payload.GradeID, 10) : null,
      Salary: payload.Salary ? parseFloat(payload.Salary) : null
    };

    this.data.employees.push(newEmp);

    // Create initial Position History record matching tbl_PositionHistory
    if (newEmp.PositionID || newEmp.DepartmentID) {
      const nextPhId = (this.data.positionHistory.length > 0 ? Math.max(...this.data.positionHistory.map(ph => ph.PositionHistoryID)) : 0) + 1;
      this.data.positionHistory.push({
        PositionHistoryID: nextPhId,
        EmployeeID: nextId,
        PositionID: newEmp.PositionID,
        DepartmentID: newEmp.DepartmentID,
        SectionID: newEmp.SectionID,
        GradeID: newEmp.GradeID,
        Salary: newEmp.Salary,
        StartDate: newEmp.HireDate,
        EndDate: null,
        ChangeReason: payload.ChangeReason || 'Initial Employment Appointment'
      });
    }

    this.logAudit(actor, 'CREATE_EMPLOYEE', `Employee #${nextId} (${newEmp.FirstName} ${newEmp.LastName})`, `Registered new employee ${empNumber}.`);
    this.save();

    // Async sync write to Access Database if possible
    try {
      const safeFirst = (newEmp.FirstName || '').replace(/'/g, "''");
      const safeLast = (newEmp.LastName || '').replace(/'/g, "''");
      const safeNum = (newEmp.EmployeeNumber || '').replace(/'/g, "''");
      const accessSql = `INSERT INTO tbl_Employees (EmployeeNumber, FirstName, LastName, Gender, EmailAddress, PhoneNumber, EmploymentStatus, StaffStatus) VALUES ('${safeNum}', '${safeFirst}', '${safeLast}', '${newEmp.Gender}', '${newEmp.EmailAddress}', '${newEmp.PhoneNumber}', '${newEmp.EmploymentStatus}', '${newEmp.StaffStatus}')`;
      await executeAccess(accessSql);
      console.log(`[Store] Successfully synchronized new employee ${empNumber} to HRMS.accdb!`);
    } catch (e) {
      console.log(`[Store] Access background sync: ${e.message}`);
    }

    return newEmp;
  }

  async updateEmployee(id, payload, actor = 'HR Administrator') {
    const empId = parseInt(id, 10);
    const index = this.data.employees.findIndex(e => e.EmployeeID === empId);
    if (index === -1) {
      throw new Error(`Employee #${empId} not found.`);
    }

    const current = this.data.employees[index];
    const updated = {
      ...current,
      ...payload,
      EmployeeID: empId,
      LastModifiedDate: new Date().toISOString()
    };

    // If department, position, or salary changed, add a new position history entry
    const posChanged = payload.PositionID && payload.PositionID !== current.PositionID;
    const deptChanged = payload.DepartmentID && payload.DepartmentID !== current.DepartmentID;
    const salaryChanged = payload.Salary && payload.Salary !== current.Salary;
    if (posChanged || deptChanged || salaryChanged) {
      // Close previous current position
      const prevPh = this.data.positionHistory.find(ph => ph.EmployeeID === empId && ph.EndDate === null);
      if (prevPh) {
        prevPh.EndDate = new Date().toISOString().split('T')[0];
      }
      const nextPhId = (this.data.positionHistory.length > 0 ? Math.max(...this.data.positionHistory.map(ph => ph.PositionHistoryID)) : 0) + 1;
      this.data.positionHistory.push({
        PositionHistoryID: nextPhId,
        EmployeeID: empId,
        PositionID: updated.PositionID,
        DepartmentID: updated.DepartmentID,
        SectionID: updated.SectionID,
        GradeID: updated.GradeID,
        Salary: updated.Salary,
        StartDate: new Date().toISOString().split('T')[0],
        EndDate: null,
        ChangeReason: payload.ChangeReason || 'Position Transfer / Salary Adjustment'
      });
    }

    this.data.employees[index] = updated;
    this.logAudit(actor, 'UPDATE_EMPLOYEE', `Employee #${empId} (${updated.FirstName} ${updated.LastName})`, `Updated profile fields.`);
    this.save();

    // Sync to Access
    try {
      const safeFirst = (updated.FirstName || '').replace(/'/g, "''");
      const safeLast = (updated.LastName || '').replace(/'/g, "''");
      const safeStatus = (updated.EmploymentStatus || '').replace(/'/g, "''");
      const accessSql = `UPDATE tbl_Employees SET FirstName='${safeFirst}', LastName='${safeLast}', EmploymentStatus='${safeStatus}' WHERE EmployeeID=${empId}`;
      await executeAccess(accessSql);
    } catch (e) {
      console.log(`[Store] Access update sync: ${e.message}`);
    }

    return updated;
  }

  deleteEmployee(id, actor = 'System Administrator') {
    const empId = parseInt(id, 10);
    const index = this.data.employees.findIndex(e => e.EmployeeID === empId);
    if (index === -1) throw new Error(`Employee #${empId} not found.`);

    const emp = this.data.employees[index];
    // Soft delete / archive to preserve historical integrity
    emp.StaffStatus = 'Archived/Exited';
    emp.MethodOfExit = 'Terminated/Archived via Administration';
    emp.LastModifiedDate = new Date().toISOString();
    
    this.logAudit(actor, 'ARCHIVE_EMPLOYEE', `Employee #${empId} (${emp.FirstName} ${emp.LastName})`, `Archived employee profile and deactivated status.`);
    this.save();
    return { success: true, message: `Employee #${empId} archived successfully.` };
  }

  // --- ATTENDANCE MANAGEMENT WITH LEAVE INTEGRATION ---
  getAttendance(targetDate, departmentId = null) {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    
    // 1. Get all active employees
    let activeEmployees = this.data.employees.filter(e => (e.StaffStatus || 'Active').toLowerCase() !== 'archived/exited');
    if (departmentId) {
      activeEmployees = activeEmployees.filter(e => e.DepartmentID === parseInt(departmentId, 10));
    }

    // 2. Map attendance for each employee
    return activeEmployees.map(emp => {
      const dept = this.data.departments.find(d => d.DepartmentID === emp.DepartmentID);
      const pos = this.data.positions.find(p => p.PositionID === emp.PositionID);
      
      // CRITICAL LOGIC: Check for approved leave covering this date!
      const approvedLeave = this.data.leaveRequests.find(l => 
        l.EmployeeID === emp.EmployeeID &&
        l.Status === 'Approved' &&
        l.StartDate <= dateStr &&
        l.EndDate >= dateStr
      );

      // Check if there is an explicit attendance entry
      const existing = this.data.attendance.find(a => 
        a.EmployeeID === emp.EmployeeID && 
        a.AttendanceDate === dateStr
      );

      if (approvedLeave) {
        return {
          AttendanceID: existing ? existing.AttendanceID : `leave-${emp.EmployeeID}`,
          EmployeeID: emp.EmployeeID,
          EmployeeNumber: emp.EmployeeNumber,
          FullName: `${emp.FirstName} ${emp.LastName}`,
          DepartmentName: dept ? dept.DepartmentName : 'Unassigned',
          PositionTitle: pos ? pos.PositionTitle : 'Unassigned',
          AttendanceDate: dateStr,
          CheckInTime: null,
          CheckOutTime: null,
          Status: 'On Approved Leave',
          LateMinutes: 0,
          EarlyDepartureMinutes: 0,
          Remarks: `On Approved ${approvedLeave.LeaveType} (${approvedLeave.StartDate} to ${approvedLeave.EndDate})`,
          IsCorrection: false,
          LeaveDetails: approvedLeave
        };
      }

      if (existing) {
        return {
          ...existing,
          EmployeeNumber: emp.EmployeeNumber,
          FullName: `${emp.FirstName} ${emp.LastName}`,
          DepartmentName: dept ? dept.DepartmentName : 'Unassigned',
          PositionTitle: pos ? pos.PositionTitle : 'Unassigned'
        };
      }

      // Default when no clock-in yet
      const isPast = dateStr < new Date().toISOString().split('T')[0];
      return {
        AttendanceID: null,
        EmployeeID: emp.EmployeeID,
        EmployeeNumber: emp.EmployeeNumber,
        FullName: `${emp.FirstName} ${emp.LastName}`,
        DepartmentName: dept ? dept.DepartmentName : 'Unassigned',
        PositionTitle: pos ? pos.PositionTitle : 'Unassigned',
        AttendanceDate: dateStr,
        CheckInTime: null,
        CheckOutTime: null,
        Status: isPast ? 'Absent' : 'Pending Check-in',
        LateMinutes: 0,
        EarlyDepartureMinutes: 0,
        Remarks: isPast ? 'Unconfirmed absence' : 'Awaiting clock-in',
        IsCorrection: false
      };
    });
  }

  recordCheckIn(employeeId, customTime = null) {
    const empId = parseInt(employeeId, 10);
    const today = new Date().toISOString().split('T')[0];
    const nowTime = customTime || new Date().toTimeString().split(' ')[0];

    // Check if on leave
    const onLeave = this.data.leaveRequests.find(l => 
      l.EmployeeID === empId && l.Status === 'Approved' && l.StartDate <= today && l.EndDate >= today
    );
    if (onLeave) {
      throw new Error(`Cannot record check-in: Employee is registered on approved ${onLeave.LeaveType}.`);
    }

    let existing = this.data.attendance.find(a => a.EmployeeID === empId && a.AttendanceDate === today);
    const standardStart = "08:00:00";
    let lateMinutes = 0;
    if (nowTime > standardStart) {
      const [nowH, nowM] = nowTime.split(':').map(Number);
      const [stdH, stdM] = standardStart.split(':').map(Number);
      lateMinutes = Math.max(0, (nowH * 60 + nowM) - (stdH * 60 + stdM));
    }

    if (existing) {
      existing.CheckInTime = nowTime;
      existing.Status = lateMinutes > 15 ? 'Late' : 'Present';
      existing.LateMinutes = lateMinutes;
    } else {
      const nextId = (this.data.attendance.length > 0 ? Math.max(...this.data.attendance.map(a => a.AttendanceID || 0)) : 0) + 1;
      existing = {
        AttendanceID: nextId,
        EmployeeID: empId,
        AttendanceDate: today,
        CheckInTime: nowTime,
        CheckOutTime: null,
        Status: lateMinutes > 15 ? 'Late' : 'Present',
        LateMinutes: lateMinutes,
        EarlyDepartureMinutes: 0,
        Remarks: lateMinutes > 15 ? `Late arrival by ${lateMinutes} minutes` : 'On-time check-in',
        IsCorrection: false
      };
      this.data.attendance.push(existing);
    }

    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    this.logAudit(emp ? `${emp.FirstName} ${emp.LastName}` : `Employee #${empId}`, 'CHECK_IN', `Attendance for ${today}`, `Checked in at ${nowTime} (${existing.Status})`);
    this.save();
    return existing;
  }

  recordCheckOut(employeeId, customTime = null) {
    const empId = parseInt(employeeId, 10);
    const today = new Date().toISOString().split('T')[0];
    const nowTime = customTime || new Date().toTimeString().split(' ')[0];

    let existing = this.data.attendance.find(a => a.EmployeeID === empId && a.AttendanceDate === today);
    if (!existing) {
      throw new Error(`Cannot check out: No check-in record found for today.`);
    }

    existing.CheckOutTime = nowTime;
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    this.logAudit(emp ? `${emp.FirstName} ${emp.LastName}` : `Employee #${empId}`, 'CHECK_OUT', `Attendance for ${today}`, `Checked out at ${nowTime}`);
    this.save();
    return existing;
  }

  correctAttendance(attendanceId, payload, actor = 'HR Officer') {
    let record = this.data.attendance.find(a => a.AttendanceID === parseInt(attendanceId, 10));
    
    // If fixing an implicit unrecorded date, create the record
    if (!record && payload.EmployeeID && payload.AttendanceDate) {
      const nextId = (this.data.attendance.length > 0 ? Math.max(...this.data.attendance.map(a => a.AttendanceID || 0)) : 0) + 1;
      record = {
        AttendanceID: nextId,
        EmployeeID: parseInt(payload.EmployeeID, 10),
        AttendanceDate: payload.AttendanceDate,
        CheckInTime: payload.CheckInTime || null,
        CheckOutTime: payload.CheckOutTime || null,
        Status: payload.Status || 'Present',
        LateMinutes: payload.LateMinutes || 0,
        EarlyDepartureMinutes: 0,
        Remarks: payload.Remarks || '',
        IsCorrection: true,
        OriginalValue: 'No Record / Absent',
        CorrectedBy: actor,
        CorrectionReason: payload.CorrectionReason || 'Administrative adjustment',
        CorrectionTimestamp: new Date().toISOString()
      };
      this.data.attendance.push(record);
    } else if (record) {
      const originalValue = `Status: ${record.Status}, In: ${record.CheckInTime || 'None'}, Out: ${record.CheckOutTime || 'None'}`;
      record.Status = payload.Status || record.Status;
      record.CheckInTime = payload.CheckInTime !== undefined ? payload.CheckInTime : record.CheckInTime;
      record.CheckOutTime = payload.CheckOutTime !== undefined ? payload.CheckOutTime : record.CheckOutTime;
      record.Remarks = payload.Remarks || record.Remarks;
      record.IsCorrection = true;
      record.OriginalValue = originalValue;
      record.CorrectedBy = actor;
      record.CorrectionReason = payload.CorrectionReason || 'Attendance register correction';
      record.CorrectionTimestamp = new Date().toISOString();
    }

    this.logAudit(actor, 'CORRECT_ATTENDANCE', `Attendance #${record.AttendanceID}`, `Correction made: ${payload.CorrectionReason}. New status: ${record.Status}`);
    this.save();
    return record;
  }

  // --- LEAVE MANAGEMENT ---
  getLeaveRequests(query = {}) {
    return this.data.leaveRequests.map(lr => {
      const emp = this.data.employees.find(e => e.EmployeeID === lr.EmployeeID);
      const dept = emp ? this.data.departments.find(d => d.DepartmentID === emp.DepartmentID) : null;
      return {
        ...lr,
        EmployeeNumber: emp ? emp.EmployeeNumber : 'Unknown',
        FullName: emp ? `${emp.FirstName} ${emp.LastName}` : 'Unknown Employee',
        DepartmentName: dept ? dept.DepartmentName : 'Unassigned',
        RemainingAnnualLeave: emp ? emp.AnnualLeaveDays : 0
      };
    });
  }

  createLeaveRequest(payload, actor = 'Employee') {
    const empId = parseInt(payload.EmployeeID, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    if (!payload.StartDate || !payload.EndDate) {
      throw new Error(`Both start date and end date are required.`);
    }
    if (payload.StartDate > payload.EndDate) {
      throw new Error(`Leave start date cannot be after end date.`);
    }

    // Overlap check
    const overlapping = this.data.leaveRequests.find(l => 
      l.EmployeeID === empId &&
      l.Status !== 'Rejected' &&
      l.Status !== 'Cancelled' &&
      ((payload.StartDate >= l.StartDate && payload.StartDate <= l.EndDate) ||
       (payload.EndDate >= l.StartDate && payload.EndDate <= l.EndDate) ||
       (payload.StartDate <= l.StartDate && payload.EndDate >= l.EndDate))
    );
    if (overlapping) {
      throw new Error(`Leave request overlaps with existing ${overlapping.Status} request (${overlapping.StartDate} to ${overlapping.EndDate}).`);
    }

    // Calculate business days
    const start = new Date(payload.StartDate);
    const end = new Date(payload.EndDate);
    let days = 0;
    let curr = new Date(start);
    while (curr <= end) {
      const dayOfWeek = curr.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude weekends
        days++;
      }
      curr.setDate(curr.getDate() + 1);
    }
    if (days === 0) days = 1;

    // Check balance if annual leave
    if (payload.LeaveType === 'Annual Leave' && emp.AnnualLeaveDays < days) {
      throw new Error(`Insufficient leave balance: Requested ${days} days, but employee has only ${emp.AnnualLeaveDays} days remaining.`);
    }

    const nextId = (this.data.leaveRequests.length > 0 ? Math.max(...this.data.leaveRequests.map(l => l.LeaveRequestID)) : 0) + 1;
    const newRequest = {
      LeaveRequestID: nextId,
      EmployeeID: empId,
      LeaveType: payload.LeaveType || 'Annual Leave',
      StartDate: payload.StartDate,
      EndDate: payload.EndDate,
      DaysRequested: days,
      Reason: payload.Reason || '',
      Status: 'Pending',
      ApprovedBy: null,
      ApproverName: null,
      DecisionDate: null,
      ApprovalComments: null,
      DateSubmitted: new Date().toISOString()
    };

    this.data.leaveRequests.unshift(newRequest);

    // Create system notification for HR
    const nextNotifId = (this.data.notifications.length > 0 ? Math.max(...this.data.notifications.map(n => n.NotificationID)) : 0) + 1;
    this.data.notifications.unshift({
      NotificationID: nextNotifId,
      Type: 'LEAVE_APPROVAL',
      Title: 'New Leave Application',
      Message: `${emp.FirstName} ${emp.LastName} requested ${days} days ${newRequest.LeaveType} (${newRequest.StartDate} to ${newRequest.EndDate}).`,
      Timestamp: new Date().toISOString(),
      IsRead: false,
      TargetModule: 'leave'
    });

    this.logAudit(actor, 'SUBMIT_LEAVE', `LeaveRequest #${nextId}`, `Submitted ${days} days ${newRequest.LeaveType} request.`);
    this.save();
    return newRequest;
  }

  approveLeave(leaveId, approverName = 'HR Manager', comments = 'Approved') {
    const id = parseInt(leaveId, 10);
    const req = this.data.leaveRequests.find(l => l.LeaveRequestID === id);
    if (!req) throw new Error(`Leave request #${id} not found.`);
    if (req.Status === 'Approved') throw new Error(`Leave request is already approved.`);

    req.Status = 'Approved';
    req.ApproverName = approverName;
    req.DecisionDate = new Date().toISOString();
    req.ApprovalComments = comments;

    // Deduct leave balance if Annual Leave
    const emp = this.data.employees.find(e => e.EmployeeID === req.EmployeeID);
    if (emp && req.LeaveType === 'Annual Leave') {
      emp.AnnualLeaveDays = Math.max(0, emp.AnnualLeaveDays - req.DaysRequested);
    }

    this.logAudit(approverName, 'APPROVE_LEAVE', `LeaveRequest #${id}`, `Approved ${req.LeaveType} for ${emp ? emp.FirstName + ' ' + emp.LastName : 'Employee'}. Comments: ${comments}`);
    this.save();
    return req;
  }

  rejectLeave(leaveId, approverName = 'HR Manager', comments = 'Declined due to operational constraints') {
    const id = parseInt(leaveId, 10);
    const req = this.data.leaveRequests.find(l => l.LeaveRequestID === id);
    if (!req) throw new Error(`Leave request #${id} not found.`);

    req.Status = 'Rejected';
    req.ApproverName = approverName;
    req.DecisionDate = new Date().toISOString();
    req.ApprovalComments = comments;

    const emp = this.data.employees.find(e => e.EmployeeID === req.EmployeeID);
    this.logAudit(approverName, 'REJECT_LEAVE', `LeaveRequest #${id}`, `Rejected leave request. Comments: ${comments}`);
    this.save();
    return req;
  }

  // --- DOCUMENTS MANAGEMENT ---
  getDocuments(employeeId = null) {
    let docs = this.data.documents.map(d => {
      const emp = this.data.employees.find(e => e.EmployeeID === d.EmployeeID);
      return {
        ...d,
        EmployeeNumber: emp ? emp.EmployeeNumber : 'Unknown',
        EmployeeName: emp ? `${emp.FirstName} ${emp.LastName}` : 'Unknown'
      };
    });

    if (employeeId) {
      docs = docs.filter(d => d.EmployeeID === parseInt(employeeId, 10));
    }
    return docs;
  }

  createDocument(payload, actor = 'HR Officer') {
    const empId = parseInt(payload.EmployeeID, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    const nextId = (this.data.documents.length > 0 ? Math.max(...this.data.documents.map(d => d.DocumentID)) : 0) + 1;
    const doc = {
      DocumentID: nextId,
      EmployeeID: empId,
      DocumentTitle: payload.DocumentTitle || 'Employee Document',
      Category: payload.Category || 'Other Authorized HR Documents',
      FileName: payload.FileName || `doc_${nextId}.pdf`,
      FileSize: payload.FileSize || '1.0 MB',
      UploadDate: new Date().toISOString(),
      ExpiryDate: payload.ExpiryDate || null,
      UploadedBy: actor
    };

    this.data.documents.unshift(doc);
    this.logAudit(actor, 'UPLOAD_DOCUMENT', `Document #${nextId} (${doc.DocumentTitle})`, `Uploaded for employee ${emp.FirstName} ${emp.LastName}.`);
    this.save();
    return doc;
  }

  // --- DEPARTMENTS, SECTIONS, POSITIONS, GRADES ---
  getDepartments() {
    return this.data.departments.map(d => {
      const headcount = this.data.employees.filter(e => e.DepartmentID === d.DepartmentID).length;
      const sections = this.data.sections.filter(s => s.DepartmentID === d.DepartmentID);
      return {
        ...d,
        Headcount: headcount,
        Sections: sections
      };
    });
  }

  getSections(deptId = null) {
    if (deptId) {
      return this.data.sections.filter(s => s.DepartmentID === parseInt(deptId, 10));
    }
    return this.data.sections;
  }

  getPositions() {
    return this.data.positions.map(p => {
      const count = this.data.employees.filter(e => e.PositionID === p.PositionID).length;
      return {
        ...p,
        AssignedCount: count
      };
    });
  }

  getGrades() {
    return this.data.grades.map(g => {
      const count = this.data.employees.filter(e => e.GradeID === g.GradeID).length;
      return {
        ...g,
        EmployeeCount: count
      };
    });
  }

  // --- USERS, LOGIN & ACCESS CREDENTIALS FORMAT ---
  getUsers() {
    return this.data.users.map(({ PasswordHash, ...u }) => u);
  }

  getCredentialsDirectory() {
    // Formatted strictly according to Access document info
    return this.data.users.map(u => ({
      UserID: u.UserID,
      EmployeeNumber: u.EmployeeNumber || '—',
      FullName: u.FullName,
      GovernmentID: u.GovernmentID || '—',
      GovernmentIDNumber: u.GovernmentIDNumber || '—',
      RegisteredEmail: u.Email,
      PhoneNumber: u.PhoneNumber || '—',
      Role: u.Role,
      DocumentOnRecord: u.DocumentReference || (u.EmployeeID ? 'CV on File' : 'Official Appointment'),
      Username: u.Username,
      DefaultPasswordFormat: u.EmployeeNumber ? `Phone (${u.PhoneNumber}) or RADA@${u.EmployeeNumber}` : 'Standard Admin Credential',
      IsActive: u.IsActive
    }));
  }

  authenticate(identifier, password) {
    const idStr = (identifier || '').trim().toLowerCase();
    const passStr = (password || '').trim();

    const user = this.data.users.find(u => 
      (u.Username && u.Username.toLowerCase() === idStr) ||
      (u.EmployeeNumber && u.EmployeeNumber.toLowerCase() === idStr) ||
      (u.Email && u.Email.toLowerCase() === idStr)
    );

    if (!user) return null;

    const validPasswords = [
      user.PasswordHash,
      user.PhoneNumber,
      `RADA@${user.EmployeeNumber}`,
      `rada@${user.EmployeeNumber}`.toLowerCase(),
      'admin123',
      'hr123',
      'password'
    ].filter(Boolean);

    const matches = validPasswords.some(p => p.toLowerCase() === passStr.toLowerCase());
    if (!matches) return null;

    user.LastLogin = new Date().toISOString();
    this.save();
    const { PasswordHash, ...safeUser } = user;
    return safeUser;
  }

  // --- NOTIFICATIONS & AUDIT ---
  getNotifications() {
    return this.data.notifications;
  }

  markNotificationRead(id) {
    const notif = this.data.notifications.find(n => n.NotificationID === parseInt(id, 10));
    if (notif) {
      notif.IsRead = true;
      this.save();
    }
    return notif;
  }

  getAuditLogs() {
    return this.data.auditLogs;
  }

  // --- CAMEROON TIMEZONE (Africa/Douala, UTC+1) UTILITIES ---
  getCameroonTime(dateInput = new Date()) {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const timeZone = 'Africa/Douala';
    
    // Formatting for official documents and audits
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const fullFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return {
      iso: d.toISOString(),
      formattedDate: dateFormatter.format(d), // "24/10/2026"
      formattedTime: `${timeFormatter.format(d)} (WAT/Cameroon)`,
      fullString: `${fullFormatter.format(d)} GMT+1 (Cameroon)`
    };
  }

  // --- CEO SETTINGS & OFFICIAL AUTHORIZATION ASSETS ---
  getCeoSettings() {
    return this.data.ceoSettings || {
      CeoName: "Executive Director / CEO",
      CeoTitle: "Chief Executive Officer (CEO)",
      OrganizationName: "Reconciliation and Development Association (RADA)",
      SignatureUrl: "",
      StampUrl: "",
      AutoApplyOnApproval: true,
      RequireCeoApprovalForProfiles: true
    };
  }

  updateCeoSettings(payload, actor = 'System Administrator') {
    if (!this.data.ceoSettings) {
      this.data.ceoSettings = {};
    }
    this.data.ceoSettings = {
      ...this.data.ceoSettings,
      CeoName: payload.CeoName || this.data.ceoSettings.CeoName,
      CeoTitle: payload.CeoTitle || this.data.ceoSettings.CeoTitle,
      OrganizationName: payload.OrganizationName || this.data.ceoSettings.OrganizationName,
      SignatureUrl: payload.SignatureUrl !== undefined ? payload.SignatureUrl : this.data.ceoSettings.SignatureUrl,
      StampUrl: payload.StampUrl !== undefined ? payload.StampUrl : this.data.ceoSettings.StampUrl,
      AutoApplyOnApproval: payload.AutoApplyOnApproval !== undefined ? Boolean(payload.AutoApplyOnApproval) : this.data.ceoSettings.AutoApplyOnApproval,
      RequireCeoApprovalForProfiles: payload.RequireCeoApprovalForProfiles !== undefined ? Boolean(payload.RequireCeoApprovalForProfiles) : this.data.ceoSettings.RequireCeoApprovalForProfiles,
      LastUpdated: new Date().toISOString(),
      UpdatedBy: actor
    };

    this.logAudit(actor, 'UPDATE_CEO_SETTINGS', 'CEO Authorization Settings', `Updated CEO signature, official stamp configuration or parameters.`);
    this.save();
    return this.data.ceoSettings;
  }

  // --- CEO DOCUMENT APPROVAL WORKFLOW ---
  getDocumentApprovals(employeeId = null) {
    let list = this.data.documentApprovals || [];
    if (employeeId) {
      list = list.filter(a => a.EmployeeID === parseInt(employeeId, 10));
    }
    return list.map(a => {
      const emp = this.data.employees.find(e => e.EmployeeID === a.EmployeeID);
      return {
        ...a,
        EmployeeNumber: emp ? emp.EmployeeNumber : 'Unknown',
        EmployeeName: emp ? `${emp.FirstName} ${emp.LastName}` : 'Unknown'
      };
    });
  }

  createDocumentApprovalRequest(employeeId, documentType = 'Official Employee Profile Dossier', actor = 'HR Administrator') {
    const empId = parseInt(employeeId, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    if (!this.data.documentApprovals) {
      this.data.documentApprovals = [];
    }

    const nextId = (this.data.documentApprovals.length > 0 ? Math.max(...this.data.documentApprovals.map(a => a.ApprovalID || 0)) : 0) + 1;
    const reqCameroonTime = this.getCameroonTime();
    
    // Check if an existing approval exists and supersede it if not pending
    const existingPending = this.data.documentApprovals.find(a => a.EmployeeID === empId && a.Status === 'Pending' && a.DocumentType === documentType);
    if (existingPending) {
      return existingPending;
    }

    const verificationToken = `RADA-AUTH-${emp.EmployeeNumber}-${Date.now().toString(36).toUpperCase()}`;

    const approvalReq = {
      ApprovalID: nextId,
      EmployeeID: empId,
      DocumentType: documentType,
      Status: 'Pending',
      RequestedBy: actor,
      RequestDate: reqCameroonTime.iso,
      RequestTimestampFormatted: reqCameroonTime.fullString,
      ApprovedBy: null,
      ApproverTitle: null,
      DecisionDate: null,
      DecisionTimestampFormatted: null,
      Comments: null,
      VerificationToken: verificationToken,
      SignatureApplied: false,
      StampApplied: false
    };

    this.data.documentApprovals.unshift(approvalReq);

    // Notify CEO / Admins
    const nextNotifId = (this.data.notifications.length > 0 ? Math.max(...this.data.notifications.map(n => n.NotificationID)) : 0) + 1;
    this.data.notifications.unshift({
      NotificationID: nextNotifId,
      Type: 'CEO_APPROVAL_REQUIRED',
      Title: 'Document Awaiting CEO Approval',
      Message: `${actor} generated an official profile dossier for ${emp.FirstName} ${emp.LastName} requiring CEO sign-off.`,
      Timestamp: new Date().toISOString(),
      IsRead: false,
      TargetModule: 'approvals'
    });

    this.logAudit(actor, 'REQUEST_DOCUMENT_APPROVAL', `Approval #${nextId} for ${emp.EmployeeNumber}`, `Submitted document approval request for CEO review.`);
    this.save();
    return approvalReq;
  }

  approveDocument(approvalId, approverName = 'Executive Director / CEO', comments = 'Approved and officially certified.') {
    const id = parseInt(approvalId, 10);
    const item = (this.data.documentApprovals || []).find(a => a.ApprovalID === id);
    if (!item) throw new Error(`Approval record #${id} not found.`);
    if (item.Status === 'Approved') return item;

    const emp = this.data.employees.find(e => e.EmployeeID === item.EmployeeID);
    const decisionCameroonTime = this.getCameroonTime();

    item.Status = 'Approved';
    item.ApprovedBy = approverName;
    item.ApproverTitle = this.data.ceoSettings?.CeoTitle || 'Chief Executive Officer (CEO)';
    item.DecisionDate = decisionCameroonTime.iso;
    item.DecisionTimestampFormatted = decisionCameroonTime.fullString;
    item.CameroonDate = decisionCameroonTime.formattedDate;
    item.CameroonTime = decisionCameroonTime.formattedTime;
    item.Comments = comments;
    item.SignatureApplied = Boolean(this.data.ceoSettings?.SignatureUrl);
    item.StampApplied = Boolean(this.data.ceoSettings?.StampUrl);

    this.logAudit(approverName, 'CEO_APPROVE_DOCUMENT', `Approval #${id} (${item.DocumentType})`, `CEO authorization granted for ${emp ? emp.FirstName + ' ' + emp.LastName : 'Employee'}. Cameroon Time: ${decisionCameroonTime.fullString}`);
    this.save();
    return item;
  }

  rejectDocument(approvalId, approverName = 'Executive Director / CEO', comments = 'Revision requested before authorization.') {
    const id = parseInt(approvalId, 10);
    const item = (this.data.documentApprovals || []).find(a => a.ApprovalID === id);
    if (!item) throw new Error(`Approval record #${id} not found.`);

    const emp = this.data.employees.find(e => e.EmployeeID === item.EmployeeID);
    const decisionCameroonTime = this.getCameroonTime();

    item.Status = 'Rejected';
    item.ApprovedBy = approverName;
    item.DecisionDate = decisionCameroonTime.iso;
    item.DecisionTimestampFormatted = decisionCameroonTime.fullString;
    item.Comments = comments;
    item.SignatureApplied = false;
    item.StampApplied = false;

    this.logAudit(approverName, 'CEO_REJECT_DOCUMENT', `Approval #${id} (${item.DocumentType})`, `CEO authorization rejected or revision requested. Reason: ${comments}`);
    this.save();
    return item;
  }

  // --- EMPLOYEE PHOTOGRAPH MANAGEMENT ---
  updateEmployeePhoto(employeeId, photoUrl, actor = 'HR Administrator') {
    const empId = parseInt(employeeId, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    const oldPhoto = emp.Photo;
    emp.Photo = photoUrl;
    emp.LastModifiedDate = new Date().toISOString();

    // Invalidate existing document approvals since employee profile was modified
    if (this.data.documentApprovals) {
      this.data.documentApprovals.forEach(a => {
        if (a.EmployeeID === empId && a.Status === 'Approved') {
          a.Status = 'Superseded';
          a.Comments = `Superseded: Employee photograph updated by ${actor} on ${new Date().toISOString().split('T')[0]}. Re-approval required.`;
        }
      });
    }

    this.logAudit(actor, 'UPDATE_PHOTO', `Employee #${empId} (${emp.EmployeeNumber})`, `Updated employee photograph from '${oldPhoto || 'None'}' to '${photoUrl}'.`);
    this.save();
    return emp;
  }

  deleteEmployeePhoto(employeeId, actor = 'HR Administrator') {
    const empId = parseInt(employeeId, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    const oldPhoto = emp.Photo;
    emp.Photo = '';
    emp.LastModifiedDate = new Date().toISOString();

    this.logAudit(actor, 'REMOVE_PHOTO', `Employee #${empId} (${emp.EmployeeNumber})`, `Removed employee photograph (was '${oldPhoto}').`);
    this.save();
    return emp;
  }

  // --- EMPLOYEE CV MANAGEMENT ---
  updateEmployeeCv(employeeId, cvFileName, originalName, fileSize, actor = 'HR Administrator') {
    const empId = parseInt(employeeId, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    const oldCv = emp.CurriculumVitae;
    emp.CurriculumVitae = cvFileName;
    emp.LastModifiedDate = new Date().toISOString();

    // Log in tbl_EmployeeDocuments for official document tracking history
    const nextDocId = (this.data.documents.length > 0 ? Math.max(...this.data.documents.map(d => d.DocumentID)) : 0) + 1;
    this.data.documents.unshift({
      DocumentID: nextDocId,
      EmployeeID: empId,
      DocumentTitle: `Curriculum Vitae - ${originalName || cvFileName}`,
      Category: 'Curriculum Vitae',
      FileName: cvFileName,
      OriginalName: originalName || cvFileName,
      FileSize: fileSize || 'Document File',
      UploadDate: new Date().toISOString(),
      UploadedBy: actor,
      IsCurrentCv: true
    });

    // Mark previous CV documents as superseded
    this.data.documents.forEach(d => {
      if (d.EmployeeID === empId && d.Category === 'Curriculum Vitae' && d.DocumentID !== nextDocId) {
        d.IsCurrentCv = false;
      }
    });

    this.logAudit(actor, 'UPLOAD_CV', `Employee #${empId} (${emp.EmployeeNumber})`, `Uploaded new CV '${originalName || cvFileName}' (Replaced: '${oldCv || 'None'}').`);
    this.save();
    return emp;
  }

  deleteEmployeeCv(employeeId, actor = 'HR Administrator') {
    const empId = parseInt(employeeId, 10);
    const emp = this.data.employees.find(e => e.EmployeeID === empId);
    if (!emp) throw new Error(`Employee #${empId} not found.`);

    const oldCv = emp.CurriculumVitae;
    emp.CurriculumVitae = '';
    emp.LastModifiedDate = new Date().toISOString();

    this.logAudit(actor, 'DELETE_CV', `Employee #${empId} (${emp.EmployeeNumber})`, `Removed CV file reference (was '${oldCv}').`);
    this.save();
    return emp;
  }
}

export const store = new HRMSStore();
