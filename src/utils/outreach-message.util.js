const DEFAULT_INITIAL_TEMPLATE = `Hi {{guestName}},

You're invited to {{eventName}}. Please confirm your RSVP here:
{{rsvpLink}}

— EventPilot AI`;

const DEFAULT_REMINDER_TEMPLATE = `Hi {{guestName}},

Friendly reminder — please RSVP for {{eventName}}:
{{rsvpLink}}

— EventPilot AI`;

const DEFAULT_HINDI_INITIAL_TEMPLATE = `{{guestName}} ji, aapko {{eventName}} mein bulaya gaya hai. Yahan RSVP karein:
{{rsvpLink}}`;

const formatEventDate = (date) => {
  try {
    return new Date(date).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata'
    });
  } catch {
    return String(date);
  }
};

const renderTemplate = (template, context) => (
  String(template)
    .replaceAll('{{guestName}}', context.guestName)
    .replaceAll('{{eventName}}', context.eventName)
    .replaceAll('{{eventDate}}', context.eventDate)
    .replaceAll('{{eventLocation}}', context.eventLocation)
    .replaceAll('{{rsvpLink}}', context.rsvpLink)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
);

const buildTemplateContext = (guest, event, rsvpLink) => ({
  guestName: guest.name,
  eventName: event.name,
  eventDate: formatEventDate(event.date),
  eventLocation: event.location,
  rsvpLink
});

const resolveInitialTemplate = (setting) => (
  setting?.outreachMessageTemplate?.trim() || DEFAULT_INITIAL_TEMPLATE
);

const resolveReminderTemplate = (setting) => (
  setting?.outreachReminderTemplate?.trim() || DEFAULT_REMINDER_TEMPLATE
);

const buildInitialMessage = (guest, event, rsvpLink, setting) => (
  renderTemplate(resolveInitialTemplate(setting), buildTemplateContext(guest, event, rsvpLink))
);

const buildReminderMessage = (guest, event, rsvpLink, setting) => (
  renderTemplate(resolveReminderTemplate(setting), buildTemplateContext(guest, event, rsvpLink))
);

module.exports = {
  DEFAULT_INITIAL_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_HINDI_INITIAL_TEMPLATE,
  buildInitialMessage,
  buildReminderMessage,
  renderTemplate,
  buildTemplateContext
};
