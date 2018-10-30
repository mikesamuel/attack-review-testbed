/**
 * @fileoverview
 * Client side JavaScript.
 */

/* eslint-env browser */
/* eslint no-var: 0, no-console: 0, prefer-arrow-callback: 0,
          prefer-destructuring: 0, prefer-template: 0, prefer-rest-params: 0 */

'use strict';

// Focus on the first form element.
document.addEventListener('DOMContentLoaded', function onReady() {
  var form = document.querySelector('form:not([name="logout"])');
  if (form) {
    var element = form.elements[0];
    if (element && element.focus) {
      element.focus();
    }
  }
});

// Transmit client-side errors to the server logs.
void (() => {
  var originalError = console.error;
  // eslint-disable-next-line id-blacklist
  console.error = function error() {
    var args = Array.prototype.slice.call(arguments);
    // Fire and forget error to server.
    var message = new window.XMLHttpRequest();
    var url = (window.origin || document.origin) + '/client-error';
    message.open('POST', url, true);
    message.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
    message.send(args.join(' '));
    return originalError.apply(console, args);
  };
})();
