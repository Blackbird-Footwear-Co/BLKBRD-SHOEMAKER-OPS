import React from 'react';
import { ProductionRemark } from '../types';
import {
  X,
  CheckCheck,
  Clock,
  ArrowRight,
  MessageSquare,
  Database
} from 'lucide-react';

interface RemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  remarks: ProductionRemark[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNavigateToOrder?: (orderId: string) => void;
  onOpenSchemaCustomizer?: () => void;
}

export const ProductionRemarksModal: React.FC<RemarksModalProps> = ({
  isOpen,
  onClose,
  remarks,
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigateToOrder,
  onOpenSchemaCustomizer
}) => {
  if (!isOpen) return null;

  const unreadCount = remarks.filter(r => !r.read).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="glass-panel rounded-3xl border border-white/80 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[88vh] my-auto">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-neutral-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white/50">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <span>Production Remarks</span>
              {unreadCount > 0 && (
                <span className="bg-neutral-900 text-white font-mono text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {unreadCount} new
                </span>
              )}
            </h3>
            <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5">
              Logged notifications from the workshop floor (Admin review only)
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
            {onOpenSchemaCustomizer && (
              <button
                onClick={onOpenSchemaCustomizer}
                className="glass-button text-xs text-neutral-700 hover:text-neutral-950 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium cursor-pointer min-h-[36px]"
                title="Customise workshop remarks database fields"
              >
                <Database className="w-3.5 h-3.5 stroke-[1.5] text-neutral-700" />
                <span>Customise Fields</span>
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="glass-button text-xs text-neutral-700 hover:text-neutral-950 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-medium cursor-pointer min-h-[36px]"
              >
                <CheckCheck className="w-3.5 h-3.5 stroke-[1.5] text-neutral-700" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="glass-button w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 cursor-pointer min-h-[36px] min-w-[36px]"
            >
              <X className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
          </div>
        </div>

        {/* List of remarks */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {remarks.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40 stroke-[1.5]" />
              <p className="text-xs">No production remarks recorded yet.</p>
            </div>
          ) : (
            remarks.map(item => (
              <div
                key={item.id}
                className={`p-3.5 glass-card rounded-2xl transition border ${
                  !item.read ? 'border-amber-400/50 bg-amber-500/5' : 'border-white/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {onNavigateToOrder ? (
                      <button
                        type="button"
                        onClick={() => onNavigateToOrder(item.orderId)}
                        className="font-mono font-semibold text-xs text-neutral-900 glass-pill px-2.5 py-0.5 rounded-full hover:bg-neutral-200 transition cursor-pointer flex items-center gap-1"
                        title="View Full Order Summary & Journey"
                      >
                        <span>Order #{item.orderId}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-neutral-500" />
                      </button>
                    ) : (
                      <span className="font-mono font-semibold text-xs text-neutral-900 glass-pill px-2.5 py-0.5 rounded-full">
                        Order #{item.orderId}
                      </span>
                    )}
                    <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-neutral-400 stroke-[1.5]" />
                      {item.timestamp}
                    </span>
                  </div>

                  {!item.read ? (
                    <button
                      onClick={() => onMarkAsRead(item.id)}
                      className="glass-button text-[11px] text-neutral-800 hover:text-neutral-950 px-2.5 py-0.5 rounded-full font-medium cursor-pointer"
                    >
                      Mark read
                    </button>
                  ) : (
                    <span className="text-[10px] text-neutral-400 uppercase font-mono">Read</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-2 text-xs text-neutral-700">
                  <span className="font-medium text-neutral-500">{item.previousStatus}</span>
                  <ArrowRight className="w-3 h-3 text-neutral-400 stroke-[1.5]" />
                  <span className="font-semibold text-neutral-900">{item.newStatus}</span>
                </div>

                <div className="mt-2 p-2.5 bg-white/60 rounded-xl text-xs text-neutral-800 font-sans border border-white/60">
                  <span className="font-medium text-neutral-500 block text-[10px] uppercase mb-0.5">
                    Remark from {item.author}:
                  </span>
                  "{item.remark}"
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200/60 bg-white/30 flex items-center justify-between text-xs text-neutral-500">
          <span>Automated audit trail for workshop changes.</span>
          <button
            onClick={onClose}
            className="bg-neutral-900 text-white px-4 py-1.5 rounded-full hover:bg-neutral-800 font-medium cursor-pointer text-xs shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};