import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(ROOT, 'js/shared/aiEmployeesCatalog.js');
const destPath = path.join(ROOT, 'js/shared/aiEmployeesCatalog.browser.js');

let body = fs.readFileSync(srcPath, 'utf8');
body = body.replace(/^\/\*\*[\s\S]*?\*\/\s*\n/, '');
body = body.replace(/^export const /gm, 'const ');
body = body.replace(/^export function /gm, 'function ');

const out = `/**
 * Browser build of AI Employees catalog — mirrors js/shared/aiEmployeesCatalog.js
 */
(function (global) {
    'use strict';

${body}

    global.ZiricAiEmployees = {
        DEPARTMENTS,
        DEPARTMENT_ROLES,
        AI_EMPLOYEES_CATALOG,
        WORKFORCE_JOURNEY,
        getDepartmentRoles,
        getAiEmployeesCatalog,
        getEmployeesByDepartment,
        formatEmployeePrice,
    };
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(destPath, out);
console.log('Created', destPath);
