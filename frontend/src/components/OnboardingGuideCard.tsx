import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import OnboardingGuideModal from './OnboardingGuideModal';
import { useJWTAuth } from '@/contexts/JWTAuthContext';

interface OnboardingGuideCardProps {
  hasCompleted: boolean;
  onStatusChange?: () => void;
}

export default function OnboardingGuideCard({
  hasCompleted,
  onStatusChange,
}: OnboardingGuideCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { tokens, user } = useJWTAuth();
  const onboardingStorageKey = user?.id ? `jibu_sales_onboarding_seen_${user.id}` : 'jibu_sales_onboarding_seen_guest';

  const persistOnboardingState = (state: 'completed' | 'dismissed') => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(onboardingStorageKey, state);
    }
  };

  const handleComplete = async () => {
    try {
      setIsLoading(true);
      const apiBase = import.meta.env.VITE_API_URL || 'https://grocery-saas-production-e339.up.railway.app';
      const response = await fetch(`${apiBase}/api/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens?.accessToken || ''}`,
        },
      });
      if (response.ok) {
        persistOnboardingState('completed');
        onStatusChange?.();
      }
    } catch (err) {
      console.error('Error completing onboarding:', err);
      persistOnboardingState('completed');
      onStatusChange?.();
    } finally {
      setIsLoading(false);
      setIsModalOpen(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsLoading(true);
      const apiBase = import.meta.env.VITE_API_URL || 'https://grocery-saas-production-e339.up.railway.app';
      const response = await fetch(`${apiBase}/api/onboarding/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens?.accessToken || ''}`,
        },
      });
      if (response.ok) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(onboardingStorageKey);
        }
        onStatusChange?.();
        setIsModalOpen(true);
      }
    } catch (err) {
      console.error('Error resetting onboarding:', err);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(onboardingStorageKey);
      }
      onStatusChange?.();
      setIsModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const quickLinks = [
    { icon: '📊', label: 'Dashboard', href: '/tenant/dashboard' },
    { icon: '📦', label: 'Inventory', href: '/tenant/inventory' },
    { icon: '💰', label: 'Sales', href: '/tenant/sales' },
    { icon: '📈', label: 'Reports', href: '/tenant/reports' },
    { icon: '⚙️', label: 'Settings', href: '/tenant/settings' },
  ];

  return (
    <>
      <div className="border-t border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mx-3 mb-3">
        {/* Header - Always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-3 mb-3"
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 rounded-full p-2">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900 text-sm">Get Started</h3>
              {!hasCompleted && (
                <div className="flex items-center gap-1 text-xs text-orange-600">
                  <AlertCircle className="w-3 h-3" />
                  New guide available
                </div>
              )}
              {hasCompleted && (
                <div className="text-xs text-green-600 font-medium">✓ Completed</div>
              )}
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="space-y-3">
            {/* Quick links */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Quick Access
              </p>
              <div className="grid grid-cols-2 gap-2">
                {quickLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-blue-100 transition text-sm text-gray-700 hover:text-blue-600 border border-gray-200"
                  >
                    <span>{link.icon}</span>
                    <span className="truncate">{link.label}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-2 space-y-2 border-t border-blue-200">
              <button
                onClick={() => setIsModalOpen(true)}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {hasCompleted ? '📖 View Guide' : '🎯 Start Guide'}
              </button>

              {hasCompleted && (
                <button
                  onClick={handleReset}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
                >
                  Restart Guide
                </button>
              )}
            </div>

            {/* Info box */}
            <div className="bg-blue-100 border border-blue-300 rounded p-2">
              <p className="text-xs text-blue-900">
                💡 <strong>Tip:</strong> This guide covers all the essentials to get you started with the platform.
              </p>
            </div>
          </div>
        )}

        {/* Collapsed view - show mini indicator if not completed */}
        {!isExpanded && !hasCompleted && (
          <div className="text-xs text-orange-600 flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-pulse"></div>
            Click to see guide
          </div>
        )}
      </div>

      {/* Modal */}
      <OnboardingGuideModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onComplete={handleComplete}
      />
    </>
  );
}
