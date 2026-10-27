import { queryAccess } from './accessBridge.js';

async function test() {
  console.log('Testing query to tbl_Departments...');
  try {
    const deps = await queryAccess('SELECT * FROM tbl_Departments');
    console.log('Departments found:', deps.length);
    console.log('First department:', deps[0]);

    const emps = await queryAccess('SELECT * FROM tbl_Employees');
    console.log('Employees found:', emps.length);
    console.log('First employee:', emps[0]?.FirstName, emps[0]?.LastName);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
