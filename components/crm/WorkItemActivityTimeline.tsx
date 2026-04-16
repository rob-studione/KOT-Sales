import { formatDate, formatDateTimeLt } from "@/lib/crm/format";
import {
  callStatusOptionLabel,
  workItemActionTypeLabel,
} from "@/lib/crm/projectBoardConstants";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";

export function WorkItemActivityTimeline({
  activities,
  compact,
}: {
  activities: ProjectWorkItemActivityDto[];
  compact?: boolean;
}) {
  if (activities.length === 0) {
    return <p className="text-sm text-zinc-500">Veiklos įrašų dar nėra.</p>;
  }

  const list = compact ? [...activities].slice(-5).reverse() : [...activities].reverse();

  return (
    <ul className={compact ? "space-y-2" : "max-h-[40vh] space-y-3 overflow-y-auto pr-1"}>
      {list.map((a) => (
        <li
          key={a.id}
          className="relative border-l-2 border-zinc-200 pl-3 text-sm before:absolute before:left-[-5px] before:top-1.5 before:size-2 before:rounded-full before:bg-zinc-300"
        >
          <div className="text-xs text-zinc-500">{formatDateTimeLt(a.occurred_at)}</div>
          <div className="mt-0.5 font-medium text-zinc-800">{workItemActionTypeLabel(a.action_type)}</div>
          <div className="mt-1 space-y-0.5 text-xs text-zinc-600">
            <div>
              <span className="text-zinc-400">Sekantis veiksmas (Kanban): </span>
              {callStatusOptionLabel(a.call_status)}
            </div>
            {a.next_action_date ? (
              <div>
                <span className="text-zinc-400">Data: </span>
                {formatDate(a.next_action_date)}
              </div>
            ) : null}
            {a.comment ? (
              <div className="whitespace-pre-wrap text-zinc-700">{a.comment}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
