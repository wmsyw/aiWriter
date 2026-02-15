'use client';

import { motion } from 'framer-motion';
import type React from 'react';
import { fadeIn } from '@/app/lib/animations';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface AccountSecurityTabProps {
  passwordForm: PasswordForm;
  setPasswordForm: React.Dispatch<React.SetStateAction<PasswordForm>>;
  passwordError: string;
  passwordSuccess: string;
  changingPassword: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export function AccountSecurityTab({
  passwordForm,
  setPasswordForm,
  passwordError,
  passwordSuccess,
  changingPassword,
  onSubmit,
}: AccountSecurityTabProps) {
  return (
    <div className="max-w-xl mx-auto space-y-6 focus:outline-none">
      <div className="space-y-1 text-center mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">账号安全</h2>
        <p className="text-gray-400">修改密码和账号安全设置</p>
      </div>

      <Card className="border-white/10 overflow-visible">
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>建议定期更换密码以保护账号安全</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="password"
              label="当前密码"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              required
            />
            <Input
              type="password"
              label="新密码"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              required
              minLength={8}
            />
            <Input
              type="password"
              label="确认新密码"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              required
            />

            {passwordError && (
              <motion.div
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {passwordError}
              </motion.div>
            )}

            {passwordSuccess && (
              <motion.div
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {passwordSuccess}
              </motion.div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                isLoading={changingPassword}
                loadingText="修改中..."
                className="w-full"
              >
                修改密码
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
