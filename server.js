try { require('node:process').loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const Busboy = require('busboy');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const publicPath = path.join(__dirname, 'public');
const dataPath = path.join(__dirname, 'data');
const usersFile = path.join(dataPath, 'users.json');

if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, '[]');
}

function getUsers() {
    try {
        return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    } catch {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
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

        req.on('end', () => {
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

function getSessionUser(req) {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)sessionId=([^;]+)/);

    if (!match) return null;

    const session = sessions.get(match[1]);

    if (!session) return null;

    const users = getUsers();
    return users.find(user => user.email === session.email) || null;
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

        if (!sessionUser || sessionUser.email.toLowerCase() !== String(process.env.ADMIN_EMAIL || '').toLowerCase()) {
            return sendJson(res, 403, {
                success: false,
                message: 'Access denied.'
            });
        }

        try {
            const file = path.join(dataPath, 'messages.json');
            let messages = [];

            if (fs.existsSync(file)) {
                messages = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
            }

            return sendJson(res, 200, {
                success: true,
                messages: messages.reverse()
            });
        } catch (error) {
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
            const users = getUsers();

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
            const file = path.join(dataPath, 'applications.json');
            let applications = [];

            if (fs.existsSync(file)) {
                applications = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
            }

            return sendJson(res, 200, {
                success: true,
                applications: applications
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

            const users = getUsers();

            if (users.some(user => user.email === email)) {
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
                emailVerified: false,
                verificationToken: verificationToken,
                verificationTokenCreatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };

            users.push(user);
            saveUsers(users);

            const resendKey = process.env.RESEND_API_KEY;

            if (!resendKey) {
                console.error('RESEND_API_KEY is not configured.');
                return sendJson(res, 500, {
                    success: false,
                    message: 'Account could not be completed because email verification is not configured.'
                });
            }

            const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
            const verificationLink =
                baseUrl.replace(/\/$/, '') +
                '/api/verify-email?token=' +
                encodeURIComponent(verificationToken);

            if (process.env.DEV_MODE === 'true') {
                console.log('DEV_MODE: skipping Resend email delivery.');
                return sendJson(res, 201, { success: true, developmentMode: true, message: 'Account created in local development mode.', verificationLink: verificationLink });
            }

            try {
                const emailResponse = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + resendKey
                    },
                    body: JSON.stringify({
                        from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
                        to: [email],
                        subject: "Verify your NYOTA member account",
                        text:
                            "Dear " + name + ",\n\n" +
                            "Thank you for registering. Please verify your email address by opening this link:\n\n" +
                            verificationLink + "\n\n" +
                            "If you did not create this account, you can ignore this email.\n\n" +
                            "NYOTA Member Website",
                        html:
                            "<!DOCTYPE html>" +
                            "<html><body style=\"font-family:Arial,sans-serif;line-height:1.6;color:#222;\">" +
                            "<h2>Verify your NYOTA member account</h2>" +
                            "<p>Dear " + name.replace(/</g, '&lt;').replace(/>/g, '&gt;') + ",</p>" +
                            "<p>Thank you for registering. Please click the button below to verify your email address.</p>" +
                            "<p><a href=\"" + verificationLink + "\" " +
                            "style=\"display:inline-block;padding:12px 20px;background:#0b6b3a;color:#fff;text-decoration:none;border-radius:6px;\">" +
                            "Verify My Email</a></p>" +
                            "<p>If the button does not work, copy and paste this link into your browser:</p>" +
                            "<p>" + verificationLink + "</p>" +
                            "<p>If you did not create this account, you can ignore this email.</p>" +
                            "</body></html>"
                    })
                });

                if (!emailResponse.ok) {
                    console.error('Resend verification email failed:', await emailResponse.text());

                    const updatedUsers = getUsers().filter(u => u.id !== user.id);
                    saveUsers(updatedUsers);

                    return sendJson(res, 500, {
                        success: false,
                        message: 'We could not send the verification email. Please try registering again.'
                    });
                }

            } catch (emailError) {
                console.error('Verification email error:', emailError.message);

                return sendJson(res, 201, {
                    success: true,
                    developmentMode: true,
                    message: 'Account created. Email could not be sent in local development mode.',
                    verificationLink: verificationLink
                });
            }

            return sendJson(res, 201, {
                success: true,
                message: 'Account created. Please check your email and click the verification link before logging in.'
            });

        } catch (error) {
            console.error(error);

            return sendJson(res, 500, {
                success: false,
                message: 'Registration failed.'
            });
        }
    }

    // EMAIL VERIFICATION
    if (req.method === 'GET' && req.url.startsWith('/api/verify-email')) {
        try {
            const requestUrl = new URL(req.url, 'http://localhost');
            const token = requestUrl.searchParams.get('token');

            if (!token) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end('<h2>Invalid verification link.</h2><p>The verification token is missing.</p>');
            }

            const users = getUsers();
            const user = users.find(u => u.verificationToken === token);

            if (!user) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end('<h2>Invalid or expired verification link.</h2><p>Please register again or contact support.</p>');
            }

            if (user.emailVerified) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end('<h2>Email already verified.</h2><p>Your account is already verified. You can now log in.</p><p><a href="/member-login.html">Go to Login</a></p>');
            }

            const tokenCreatedAt = new Date(user.verificationTokenCreatedAt).getTime();
            const tokenAge = Date.now() - tokenCreatedAt;
            const tokenLifetime = 24 * 60 * 60 * 1000;

            if (!Number.isFinite(tokenCreatedAt) || tokenAge > tokenLifetime) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end('<h2>Verification link expired.</h2><p>Please register again or contact support.</p>');
            }

            user.emailVerified = true;
            delete user.verificationToken;
            delete user.verificationTokenCreatedAt;

            saveUsers(users);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(
                '<!DOCTYPE html>' +
                '<html><head><meta charset="UTF-8"><title>Email Verified</title></head>' +
                '<body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;">' +
                '<h2>Email verified successfully!</h2>' +
                '<p>Your NYOTA member account is now verified.</p>' +
                '<p><a href="/member-login.html">Continue to Login</a></p>' +
                '</body></html>'
            );

        } catch (error) {
            console.error(error);

            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end('<h2>Verification failed.</h2><p>Please try again later.</p>');
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

            const users = getUsers();
            const user = users.find(user => user.email === email);

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

            if (!user.emailVerified) {
                return sendJson(res, 403, {
                    success: false,
                    message: 'Please verify your email address before logging in. Check your email for the verification link.'
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
        const sessionUser = getSessionUser(req);

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
                idNumber: sessionUser.idNumber || ''
            }
        });
    }

    // JOB APPLICATIONS
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

            const applicationsFile = path.join(dataPath, 'applications.json');

            if (!fs.existsSync(applicationsFile)) {
                fs.writeFileSync(applicationsFile, '[]');
            }

            const applications = JSON.parse(
                fs.readFileSync(applicationsFile, 'utf8')
            );

            const application = {
                id: crypto.randomUUID(),
                name,
                email,
                phone,
                idNumber,
                country,
                job,
                experience,
                education,
                message,
                cv: {
                    originalName: cvFile.originalName,
                    storedName: cvFile.storedName,
                    mimeType: cvFile.mimeType
                },
                submittedAt: new Date().toISOString()
            };

            applications.push(application);

            fs.writeFileSync(
                applicationsFile,
                JSON.stringify(applications, null, 2)
            );

            return sendJson(res, 201, {
                success: true,
                message: 'Application submitted successfully.',
                applicationId: application.id
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

    if (req.method === "POST" && req.url === "/api/messages") {
        const sessionUser = getSessionUser(req);

        if (!sessionUser) {
            return sendJson(res, 401, {
                success: false,
                message: "Please log in to use the Message Center."
            });
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const data = JSON.parse(body);
                if (!data.name || !data.email || !data.subject || !data.message) {
                    res.writeHead(400, {"Content-Type":"application/json"});
                    res.end(JSON.stringify({success:false,message:"Please complete all fields."}));
                    return;
                }
                const fs = require("fs");
                const path = require("path");
                const dir = path.join(__dirname, "data");
                const file = path.join(dir, "messages.json");
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
                let messages = [];
                if (fs.existsSync(file)) messages = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
                messages.push({id:crypto.randomUUID(),name:data.name,email:data.email,subject:data.subject,message:data.message,createdAt:new Date().toISOString()});
                fs.writeFileSync(file, JSON.stringify(messages,null,2));
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