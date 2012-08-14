// Copyright 2010 and onwards Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Script that runs in the context of the browser action popup.
 *
 * @author manas@google.com (Manas Tungare)
 */

/**
 * Namespace for browser action functionality.
 */
var browseraction = {};

/**
 * The URL of the browser UI for Google Calendar.
 * @type {string}
 * @const
 */
browseraction.CALENDAR_UI_URL_ = 'https://www.google.com/calendar/';


/**
 * Initializes UI elements in the browser action popup.
 */
browseraction.initialize = function() {
  browseraction.fillMessages_();
  browseraction.installTabStripClickHandlers_();
  browseraction.installButtonClickHandlers_();
  browseraction.showLoginMessageIfNotAuthenticated_();
  browseraction.showDetectedEvents_();
  chrome.extension.sendMessage({method: 'events.feed.get'},
      browseraction.showEventsFromFeed_);
};


/**
 * Fills i18n versions of messages from the Chrome API into DOM objects.
 * @private
 */
browseraction.fillMessages_ = function() {
  // Load internationalized messages.
  $('.i18n').each(function() {
    var i18nText = chrome.i18n.getMessage($(this).attr('id').toString());
    if ($(this).prop('tagName') == 'IMG') {
      $(this).attr({'title': i18nText});
    } else {
      $(this).text(i18nText);
    }
  });

  $('[data-href="calendar_ui_url"]').attr('href', browseraction.CALENDAR_UI_URL_);
};


/**
 * Makes the tab strip clickable, and sets it up to switch tabs on clicking.
 * @private
 */
browseraction.installTabStripClickHandlers_ = function() {
  $('#add-events').click(function() {
    $('.selected').removeClass('selected');
    $('.tab').hide();
    $('#add-events').addClass('selected');
    $('#events').show();
  });

  $('#view_agenda').click(function() {
    $('.selected').removeClass('selected');
    $('.tab').hide();
    $('#view_agenda').addClass('selected');
    $('#agenda').show();
  }).click();  // Execute the handler that was just assigned.
};


/**
 * Adds click handlers to buttons and clickable objects.
 * @private
 */
browseraction.installButtonClickHandlers_ = function() {
  $('#sync_now').on('click', function() {
    chrome.extension.sendMessage({method: 'events.feed.fetch'},
        browseraction.showEventsFromFeed_);
  });
};


/**
 * Checks if we're logged in (by using the badge icon text as a proxy) and
 * either shows or hides a message asking the user to login.
 * @private
 */
browseraction.showLoginMessageIfNotAuthenticated_ = function() {
  // Check if we're authenticated or not, and display either the "Login Now"
  // message, or show the tab strip.
  chrome.browserAction.getBadgeText({}, function(text) {
    if (text == '?') {  // Not authorized.
      $('.tab-container').hide();
      $('#error').show();

      // If we're not authenticated, then it's fine to re-request the feed
      // upon explicit user interaction (i.e. opening the popup.)
      chrome.extension.sendMessage({method: 'events.feed.fetch'},
          browseraction.showEventsFromFeed_);
    } else {
      $('.tab-container').show();
      $('#error').hide();
    }
  });
};


/**
 * Shows events detected on the current page (by one of the parsers) in a list
 * inside the browser action popup.
 * @private
 */
browseraction.showDetectedEvents_ = function() {
  chrome.extension.sendMessage({method: 'events.detected.get'}, function(eventsFromPage) {
    // Pick a layout based on how many events we have to show: 0, 1, or >1.
    if (eventsFromPage && eventsFromPage.length > 0) {
      $('#events').append('<div id="events_list"></div>');
      $.each(eventsFromPage, function(i, event) {
        $('#events_list').append(browseraction.createEventButton_(event, false));
      });
      $('#add-events').click();
    }
  });
};


/**
 * Retrieves events from the calendar feed, sorted by start time, and displays
 * them in the browser action popup.
 * @param {Array} events The events to display.
 * @private
 */
browseraction.showEventsFromFeed_ = function(events) {
  for (var i = 0; i < events.length; i++) {
    var event = events[i];

    var start = utils.fromIso8601(event.start);
    var end = utils.fromIso8601(event.end);
    var allDay = !end ||
        (start.hours() === 0 && start.minutes() === 0 &&
        end.hours() === 0 && end.minutes() === 0);

    // Insert a date header if the date of this event is not the same as that of the
    // previous event.
    var lastDateHeader;
    var startDate = start.clone().hours(0).minutes(0).seconds(0);
    if (!lastDateHeader || startDate.diff(lastDateHeader, 'hours') > 23) {
      lastDateHeader = startDate;
      $('<div>').addClass('date-header')
          .text(lastDateHeader.format('dddd MMMM, D'))
          .appendTo($('#agenda'));
    }

    var eventDiv = $('<div>')
        .addClass('event')
        .attr({'data-url': event.url})
        .appendTo($('#agenda'));

    eventDiv.on('click', function() {
      chrome.tabs.create({'url': $(this).attr('data-url')});
    });

    $('<div>').addClass('feed-color')
        .css({'background-color': event.feed.color})
        .attr({'title': event.feed.title})
        .appendTo(eventDiv);

    var eventDetails = $('<div>').addClass('event-details').appendTo(eventDiv);

    $('<h1>').text(event.title).appendTo(eventDetails);

    if (!allDay) {
      $('<div>').addClass('start-and-end-times')
          .append($('<span>').addClass('start').text(start.format('h:mma')))
          .append(' – ')
          .append($('<span>').addClass('end').text(end.format('h:mma')))
          .appendTo(eventDetails);
    }

    if (event.location) {
      $('<div>').addClass('location').text(event.location).appendTo(eventDetails);
    }
  }
};


/**
 * Returns HTML for a button for a single event, which when clicked, will
 * add that event to the user's Google Calendar.
 * @param {CalendarEvent} event The calendar event.
 * @param {boolean} opt_useDefaultAnchorText True to ignore event title and use
 *     standard anchor text instead. Used in single event mode.
 * @return {jQuery} The rendered 'Add to Calendar' button.
 * @private
 */
browseraction.createEventButton_ = function(event, opt_useDefaultAnchorText) {
  var button = $('<a>');
  button.addClass('single-event')
      .attr({
        'href': event.gcal_url,
        'title': chrome.i18n.getMessage('add_to_google_calendar'),
        'target': '_blank'
      })
      .html(opt_useDefaultAnchorText ?
          chrome.i18n.getMessage('add_to_google_calendar') :
          event.title);
  return button;
};


/**
 * When the popup is loaded, fetch the events in this tab from the
 * background page, set up the appropriate layout, etc.
 */
window.addEventListener('load', function() {
  browseraction.initialize();
}, false);

