import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/src/server/db';
import { sendPasswordResetEmail } from '@/src/server/email';
import { verifyCsrf } from '@/src/server/middleware/csrf';
import { checkRateLimit, getClientIp } from '@/src/server/middleware/rate-limit';

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const csrfError = verifyCsrf(request);
  if (csrfError) return csrfError;

  const rateLimitError = await checkRateLimit(getClientIp(request), 'auth/forgot-password');
  if (rateLimitError) return rateLimitError;

  if (!process.env.SMTP_HOST) {
    return NextResponse.json({ error: 'Password reset is not available. SMTP not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { email } = requestSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiry = new Date(Date.now() + 3600000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: tokenHash,
          resetTokenExpiry: expiry,
        },
      });

      await sendPasswordResetEmail(email, token);
    }

    return NextResponse.json({ 
      message: 'If the email exists, a reset link has been sent' 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
