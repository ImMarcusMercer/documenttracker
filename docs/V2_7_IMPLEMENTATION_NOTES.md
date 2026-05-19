# DocTracker v2.7 Implementation Notes

## Focus

Version 2.7 implements the bonus **Chat/Help Desk** requirement as a ticketing system instead of immediate live chat. This is more appropriate for an academic document-tracking system because support requests become traceable, auditable, assignable, and compatible with the existing notification and audit modules.

## Added Role

- Role: `HELPDESK`
- Display name: `Help Desk`
- Seeded account: `helpdesk@docutracker.local`
- Seeded password: `Password123!`

The Help Desk role receives support-ticket permissions and notification access. Admin keeps full access. Developer can also access tickets for technical support/demo purposes.

## Backend Additions

- `support_tickets` table
- `support_ticket_messages` table
- `App\Models\SupportTicket`
- `App\Models\SupportTicketMessage`
- `App\Http\Controllers\Api\HelpDeskTicketController`

## Main APIs

- `GET /api/v1/helpdesk/tickets`
- `POST /api/v1/helpdesk/tickets`
- `GET /api/v1/helpdesk/tickets/stats`
- `GET /api/v1/helpdesk/tickets/{ticket}`
- `PATCH /api/v1/helpdesk/tickets/{ticket}`
- `DELETE /api/v1/helpdesk/tickets/{ticket}`
- `POST /api/v1/helpdesk/tickets/{ticket}/restore`
- `POST /api/v1/helpdesk/tickets/{ticket}/messages`

## Frontend Additions

- `resources/js/pages/HelpDesk.jsx`
- `resources/js/components/layout/HelpDeskFloatingButton.jsx`
- `/helpdesk` route
- `/help` redirect route
- Sidebar `Need Help` entry
- Floating `Need Help?` access button on authenticated pages

## Ticket Workflow

1. Any authenticated user opens **Need Help**.
2. User submits a ticket with subject, category, priority, and details.
3. Help Desk/Admin users receive in-app/popup/email-capable notifications.
4. Help Desk user opens the Help Desk Console and reviews the ticket queue.
5. Help Desk user changes status, priority, category, and resolution notes as needed.
6. Help Desk user replies through the ticket thread.
7. The requester receives a notification and can reply back.
8. Help Desk can resolve, close, or archive the ticket.

## Not Live Chat

The floating immediate assistant/chat UI is no longer used as the main Help access point. Support is handled through persistent tickets and ticket messages. This makes the feature easier to defend because each support request has a ticket number, audit trail, status, priority, and notification history.

## Validation

- PHP syntax checks passed for new backend files.
- `npm run build` completed successfully.
