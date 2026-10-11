const mongoose = require('mongoose');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, message);
const notFound = (message = 'Not found') => new HttpError(404, message);

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw badRequest(`Invalid ${label}`);
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));

// Calendar date and wall-clock time in the institution's time zone. The original
// client used UTC for the date and local time for the clock, which put scans
// before 05:30 IST on the previous day.
const timeZone = () => process.env.FRAMS_TIMEZONE || undefined;
const localDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const localTime = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);

const isDuplicateKey = (err) => err && err.code === 11000;

module.exports = { HttpError, badRequest, forbidden, notFound, assertObjectId, isIsoDate, localDate, localTime, isDuplicateKey };
