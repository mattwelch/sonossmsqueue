## Overview
Use SMS to add songs from Rdio to a Sonos queue. Required is a twilio account, an Rdio account, an Rdio dev account, and a Sonos. Check out this blog post for a [quick video demo](http://mattwel.ch/adding-songs-to-sonos-queue-with-sms).
## Setup
Clone this repo, and execute `npm install` inside the created directory. This may take a while, as the sqlite3 package will possibly be compiled on your machine.

Get a [Twilio](http://twilio.com) developer account and phone number. A trial account is fine for testing, but if you're going to roll this out for a gathering, you'll want to pay the $1 for a phone number, and the $0.0075 per text, just so you don't have to add all your guests' phone number manually. Also so you don't get the "Twilio Trial" lead in all your texts. Note your auth token for later use.

After you've gotten your phone number from Twilio, you need to tell it where to send the SMS-received webhooks. (These are the calls Twilio will make to your code to notifiy you of incoming texts). Go to your [numbers page](https://www.twilio.com/user/account/phone-numbers/incoming) and click on the number you'll be using for this project. Under the **Messaging** banner, enter the full url you plan to use to receive the webhooks, and select `HTTP POST` as the webhook type.

Get an Rdio [developer account](http://www.rdio.com/developers/). This will actually end up being a mashery account. (Mashery helps companies develop and deploy APIs). Once you've got everything set up, and created a new Rdio app, note the client id and secret.
## Execution
There are four environment variables the code calls for:

1: `RDIO_USER_NAME`: Your Rdio username (usually your email address)

2: `RDIO_KEY`: Your Rdio client key

3: `RDIO_SECRET`: Your Rdio client secret

4: `TWILIO_AUTH_TOKEN`: Your Twilio Auth token

You can either set these with the traditional `export` method in your `.bashrc` (or similar), or you can just set them all at the same time before executing the sonossmsqueue script:

	$ RDIO_USER_NAME=user@xxx.com RDIO_KEY=123456 RDIO_SECRET=54321 TWILIO_AUTH_TOKEN=98765 node sonossmsqueue.js

Once the script is running, you're ready to send some search texts.
## Use
Text a search term to your twilio number, and wait for the result. You're search will either result in a song added to the Sonos queue, a list of songs from which to choose returned to the sender, or a "No songs found" message returned to the sender.

In the case of a list of songs returned, the user simply replied with a "1", "2", or "3" to select one of the three possible songs.
