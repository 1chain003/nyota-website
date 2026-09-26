try { require('node:process').loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const Busboy = require('busboy');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

db.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

const PORT = Number(process.env.PORT) || 3000;
const publicPath = path.join(__dirname, 'public');
const dataPath = path.join(__dirname, 'data');
async function getUsersFromDb() {
    const result = await db.query(
        `SELECT id, name, email, phone, id_number AS "idNumber",
                city, postal_code AS "postalCode",
                password_hash AS "passwordHash", salt,
                email_verified AS "emailVerified",
                created_at AS "createdAt"
         FROM users
         ORDER BY created_at ASC`
    );
    return result.rows;
}

async function getUserByEmail(email) {
    const result = await db.query(
        `SELECT id, name, email, phone, id_number AS "idNumber",
                city, postal_code AS "postalCode",
                password_hash AS "passwordHash", salt,
                email_verified AS "emailVerified",
                created_at AS "createdAt"
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email]
    );
    return result.rows[0] || null;
}

async function createUserInDb(user) {
    await db.query(
        `INSERT INTO users
         (id, name, email, phone, id_number, city, postal_code,
          password_hash, salt, email_verified, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
            user.id,
            user.name || '',
            user.email,
            user.phone || '',
            user.idNumber || '',
            user.city || '',
            user.postalCode || '',
            user.passwordHash || '',
            user.salt || '',
            user.emailVerified !== false,
            user.createdAt || new Date().toISOString()
        ]
    );
}

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;

            if (body.length > 100000) {
                reject(new Error('Request too large'));
                req.destroy();
            }
        });

        req.on('end', async () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', reject);
    });
}

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};


const sessions = new Map();

async function getSessionUser(req) {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)sessionId=([^;]+)/);

    if (!match) return null;

    const session = sessions.get(match[1]);

    if (!session) return null;

    return await getUserByEmail(session.email);
}


function getSessionId(req) {
    const cookie = req.headers.cookie || "";
    const match = cookie.match(/(?:^|; )sessionId=([^;]+)/);
    return match ? match[1] : null;
}

function getAdminSession(req) {
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)adminSessionId=([^;]+)/);
    if (!match) return null;

    const session = sessions.get(match[1]);
    if (!session || !session.admin) return null;
    if (session.email !== process.env.ADMIN_EMAIL) return null;

    return session;
}

function isLoggedIn(req) {
    const sessionId = getSessionId(req);
    return !!(sessionId && sessions.has(sessionId));
}

const server = http.createServer(async (req, res) => {

    // ADMIN MESSAGES INBOX
    if (req.method === 'GET' && req.url === '/api/admin/messages') {
        const adminSession = getAdminSession(req);

        if (!adminSession) {
            return sendJson(res, 401, {
                success: false,
                message: 'Admin authentication required.'
            });
        }

        try {
            const result = await db.query(
                "SELECT id, name, email, subject, message, created_at AS \"createdAt\" FROM messages ORDER BY created_at DESC"
            );

            return sendJson(res, 200, {
                success: true,
                messages: result.rows
            });
        } catch (error) {
            console.error('Admin messages error:', error.message);
            return sendJson(res, 500, {
                success: false,
                message: 'Could not load messages.'
            });
        }
    }

    // REGISTRATION
    if (req.method === 'GET' && req.url === '/api/admin/users') {
        const adminSession = getAdminSession(req);

        if (!adminSession) {
            return sendJson(res, 401, {
                success: false,
                message: 'Admin authentication required.'
            });
        }

        try {
            const users = await getUsersFromDb();

            const safeUsers = users.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                idNumber: user.idNumber || '',
                city: user.city || '',
                postalCode: user.postalCode || '',
                emailVerified: user.emailVerified || false,
                createdAt: user.createdAt || ''
            }));

            return sendJson(res, 200, {
                success: true,
                users: safeUsers
            });
        } catch (error) {
            return sendJson(res, 500, {
                success: false,
                message: 'Unable to load registered users.'
            });
        }
    }

    if (req.method === 'GET' && req.url === '/api/admin/applications') {
        const adminSession = getAdminSession(req);

        if (!adminSession) {
            return sendJson(res, 401, {
                success: false,
                message: 'Admin authentication required.'
            });
        }

        try {
            const result = await db.query(
                
            );

            return sendJson(res, 200, {
                success: true,
                applications: result.rows
            });
        } catch (error) {
            return sendJson(res, 500, {
                success: false,
                message: 'Unable to load job applications.'
            });
        }
    }

    if (req.method === 'GET' && req.url === '/api/admin/me') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
        return sendJson(res, 401, { success: false, message: 'Admin authentication required.' });
    }
    return sendJson(res, 200, { success: true, admin: { email: adminSession.email } });
}

if (req.method === 'POST' && req.url === '/api/admin/logout') {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)adminSessionId=([^;]+)/);
    if (match) sessions.delete(match[1]);
    res.setHeader('Set-Cookie', 'adminSessionId=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
    return sendJson(res, 200, { success: true, message: 'Admin logged out.' });
}

if (req.method === 'POST' && req.url === '/api/register') {
        try {
            const body = await readBody(req);

            const name = String(body.name || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            const phone = String(body.phone || '').trim();
            const idNumber = String(body.idNumber || '').trim();
            const city = String(body.city || '').trim();
            const postalCode = String(body.postalCode || '').trim();
            const password = String(body.password || '');

            if (!name || !email || !phone || !idNumber || !city || !postalCode || !password) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Please fill in all fields.'
                });
            }

            let passwordScore = 0;

            if (password.length >= 10) passwordScore++;
            if (/[a-z]/.test(password)) passwordScore++;
            if (/[A-Z]/.test(password)) passwordScore++;
            if (/[0-9]/.test(password)) passwordScore++;
            if (/[^A-Za-z0-9]/.test(password)) passwordScore++;

            const passwordStrength =
                password.length === 0 || passwordScore <= 2 ? 'Weak' :
                passwordScore <= 4 ? 'Medium' : 'Strong';

            if (passwordStrength === 'Weak') {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Password is too weak. Please use at least 10 characters and improve its strength.'
                });
            }

            const existingUser = await getUserByEmail(email);

            if (existingUser) {
                return sendJson(res, 409, {
                    success: false,
                    message: 'An account with this email already exists.'
                });
            }

            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = hashPassword(password, salt);

            const verificationToken = crypto.randomBytes(32).toString('hex');

            const user = {
                id: crypto.randomUUID(),
                name: name,
                email: email,
                phone: phone,
                idNumber: idNumber,
                city: city,
                postalCode: postalCode,
                passwordHash: passwordHash,
                salt: salt,
                emailVerified: true,
                verificationToken: verificationToken,
                verificationTokenCreatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };

            await createUserInDb(user);

            return sendJson(res, 201, {
                success: true,
                message: 'Account created successfully. You can now log in.'
            });

        } catch (error) {
            console.error(error);

            return sendJson(res, 500, {
                success: false,
                message: 'Registration failed.'
            });
        }
    }

    if (req.method === 'POST' && req.url === '/api/admin/login') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                const email = String(data.email || '').trim().toLowerCase();
                const password = String(data.password || '');

                if (
                    email !== String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() ||
                    password !== String(process.env.ADMIN_PASSWORD || '')
                ) {
                    return sendJson(res, 401, {
                        success: false,
                        message: 'Invalid admin credentials.'
                    });
                }

                const sessionId = crypto.randomBytes(32).toString('hex');

                sessions.set(sessionId, {
                    email: email,
                    admin: true,
                    createdAt: Date.now()
                });

                res.setHeader(
                    'Set-Cookie',
                    'adminSessionId=' + sessionId + '; HttpOnly; Path=/; SameSite=Lax'
                );

                return sendJson(res, 200, {
                    success: true,
                    message: 'Admin login successful.'
                });
            } catch (error) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Invalid request.'
                });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/login') {
        try {
            const body = await readBody(req);

            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');

            const user = await getUserByEmail(email);

            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            const passwordHash = hashPassword(password, user.salt);

            if (passwordHash !== user.passwordHash) {
                return sendJson(res, 401, {
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            const sessionId = crypto.randomBytes(32).toString("hex");
            sessions.set(sessionId, { email: user.email, createdAt: Date.now() });
            res.setHeader("Set-Cookie", "sessionId=" + sessionId + "; HttpOnly; Path=/; SameSite=Lax");

            return sendJson(res, 200, {
                    success: true,
                    message: 'Login successful.' ,
                user: {
                    name: user.name,
                    email: user.email,
                    phone: user.phone
                }
            });

        } catch (error) {
            console.error(error);

            return sendJson(res, 500, {
                success: false,
                message: 'Login failed.'
            });
        }
    }
    // CURRENT MEMBER PROFILE
    if (req.method === 'GET' && req.url === '/api/me') {
        const sessionUser = await getSessionUser(req);

        if (!sessionUser) {
            return sendJson(res, 401, {
                success: false,
                message: 'Please log in first.'
            });
        }

        return sendJson(res, 200, {
            success: true,
            user: {
                name: sessionUser.name || '',
                email: sessionUser.email || '',
                phone: sessionUser.phone || '',
                idNumber: sessionUser.idNumber || '',
                city: sessionUser.city || '',
                postalCode: sessionUser.postalCode || ''
            }
        });
    }

    // JOB APPLICATIONS
    if (req.method === 'POST' && req.url === '/api/university-applications') {
        let body = '';

        req.on('data', chunk => {
            body += chunk;

            if (body.length > 1000000) {
                req.destroy();
            }
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');

                const {
                    country,
                    university,
                    program,
                    fullName,
                    email,
                    phone,
                    education,
                    statement
                } = data;

                if (!country || !university || !program ||
                    !fullName || !email || !phone ||
                    !education || !statement) {
                    return sendJson(res, 400, {
                        success: false,
                        message: 'Please complete all required fields.'
                    });
                }

                const applicationId = crypto.randomUUID();
                const submittedAt = new Date().toISOString();

                await db.query(
                    `INSERT INTO applications (id, type, country, university, program, name, email, phone, education, message, submitted_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
                    [
                        applicationId,
                        'university-scholarship',
                        country,
                        university,
                        program,
                        fullName,
                        email,
                        phone,
                        education,
                        statement,
                        submittedAt
                    ]
                );

                return sendJson(res, 201, {
                    success: true,
                    message: 'University application submitted successfully.',
                    applicationId: applicationId
                });

            } catch (error) {
                console.error('University application error:', error);

                return sendJson(res, 500, {
                    success: false,
                    message: 'Unable to submit university application.'
                });
            }
        });

        return;
    }

    if (req.method === 'POST' && req.url === '/api/applications') {
        const adminSession = getAdminSession(req);

        if (!sessionUser) {
            return sendJson(res, 401, {
                success: false,
                message: 'Please log in before applying for a job.'
            });
        }

        try {
            const contentType = req.headers['content-type'] || '';

            if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Please submit the application using the required form.'
                });
            }

            const busboy = Busboy({
                headers: req.headers,
                limits: {
                    fileSize: 5 * 1024 * 1024,
                    files: 1
                }
            });

            const fields = {};
            let cvFile = null;
            let fileError = null;

            busboy.on('field', (name, value) => {
                fields[name] = value;
            });

            busboy.on('file', (name, file, info) => {
                const { filename, mimeType } = info;

                if (name !== 'cv') {
                    file.resume();
                    return;
                }

                const allowedTypes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                ];

                const extension = path.extname(filename || '').toLowerCase();

                if (!allowedTypes.includes(mimeType) ||
                    !['.pdf', '.doc', '.docx'].includes(extension)) {
                    fileError = 'CV must be a PDF, DOC, or DOCX file.';
                    file.resume();
                    return;
                }

                const cvDirectory = path.join(dataPath, 'cvs');

                if (!fs.existsSync(cvDirectory)) {
                    fs.mkdirSync(cvDirectory, { recursive: true });
                }

                const safeName = crypto.randomUUID() + extension;
                const cvPath = path.join(cvDirectory, safeName);
                const writeStream = fs.createWriteStream(cvPath);

                file.on('limit', () => {
                    fileError = 'CV file is too large. Maximum size is 5 MB.';
                    writeStream.destroy();
                    try { fs.unlinkSync(cvPath); } catch {}
                });

                file.on('error', () => {
                    fileError = 'There was a problem uploading the CV.';
                    writeStream.destroy();
                    try { fs.unlinkSync(cvPath); } catch {}
                });

                writeStream.on('error', () => {
                    fileError = 'There was a problem saving the CV.';
                    try { fs.unlinkSync(cvPath); } catch {}
                });

                file.pipe(writeStream);

                cvFile = {
                    originalName: filename,
                    storedName: safeName,
                    path: cvPath,
                    mimeType
                };
            });

            await new Promise((resolve, reject) => {
                busboy.on('finish', resolve);
                busboy.on('error', reject);
                req.pipe(busboy);
            });

            const name = String(sessionUser.name || '').trim();
            const email = String(sessionUser.email || '').trim().toLowerCase();
            const phone = String(sessionUser.phone || '').trim();
            const idNumber = String(sessionUser.idNumber || '').trim();

            const country = String(fields.country || '').trim();
            const job = String(fields.job || '').trim();
            const experience = String(fields.experience || '').trim();
            const education = String(fields.education || '').trim();
            const message = String(fields.message || '').trim();

            if (!name || !email || !phone || !idNumber) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Your member profile is missing required information.'
                });
            }

            if (!country || !job) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Please select the job and country.'
                });
            }

            if (!cvFile) {
                return sendJson(res, 400, {
                    success: false,
                    message: fileError || 'Please upload your CV.'
                });
            }

            if (fileError) {
                try { fs.unlinkSync(cvFile.path); } catch {}

                return sendJson(res, 400, {
                    success: false,
                    message: fileError
                });
            }

            const applicationId = crypto.randomUUID();
            const submittedAt = new Date().toISOString();

            await db.query(
                    `INSERT INTO applications (id, type, country, university, program, name, email, phone, education, message, submitted_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
                [
                    applicationId,
                    'job-application',
                    name,
                    email,
                    phone,
                    country,
                    job,
                    experience,
                    education,
                    message,
                    submittedAt
                ]
            );

            return sendJson(res, 201, {
                success: true,
                message: 'Application submitted successfully.',
                applicationId: applicationId
            });

        } catch (error) {
            console.error('Application submission error:', error);

            return sendJson(res, 500, {
                success: false,
                message: 'Application submission failed.'
            });
        }
    }

    // PROTECT KAZI MAJUU
    if (req.method === "GET" && req.url.split("?")[0] === "/kazi-majuu.html") {
        if (!isLoggedIn(req)) {
            res.writeHead(302, { Location: "/member-login.html" });
            res.end();
            return;
        }
    }

    if (req.method === "GET" && ["/university-scholarships.html","/university-country.html","/university-programs.html","/university-application.html"].includes(req.url.split("?")[0])) {
        if (!isLoggedIn(req)) {
            res.writeHead(302, { Location: "/member-login.html" });
            res.end();
            return;
        }
    }

    if (req.method === "POST" && req.url === "/api/messages") {
        const sessionUser = await getSessionUser(req);

        if (!sessionUser) {
            return sendJson(res, 401, {
                success: false,
                message: "Please log in to use the Message Center."
            });
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const data = JSON.parse(body);
                if (!data.name || !data.email || !data.subject || !data.message) {
                    res.writeHead(400, {"Content-Type":"application/json"});
                    res.end(JSON.stringify({success:false,message:"Please complete all fields."}));
                    return;
                }
                await db.query(
                    `INSERT INTO messages (id, name, email, subject, message, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
                    [
                        crypto.randomUUID(),
                        data.name,
                        data.email,
                        data.subject,
                        data.message,
                        new Date().toISOString()
                    ]
                );

                res.writeHead(200, {"Content-Type":"application/json"});
                res.end(JSON.stringify({success:true}));
            } catch (error) {
                res.writeHead(500, {"Content-Type":"application/json"});
                res.end(JSON.stringify({success:false,message:"Could not save the message."}));
            }
        });
        return;
    }
    // WEBSITE FILES
    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    if (urlPath === '/') {
        urlPath = '/index.html';
    }

    const filePath = path.resolve(
        publicPath,
        '.' + path.normalize(urlPath)
    );

    if (!filePath.startsWith(publicPath + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end('Page not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType =
            mimeTypes[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType
        });

        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(
        `Nyota website running at http://127.0.0.1:${PORT}`
    );
});