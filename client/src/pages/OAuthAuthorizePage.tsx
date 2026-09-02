import React from 'react';

/** OAuth 授权页面已移除（国内版本不支持 OAuth） */
export default function OAuthAuthorizePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-content-muted">OAuth 授权功能不可用</p>
    </div>
  );
}
