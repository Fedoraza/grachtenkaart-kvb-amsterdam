import test from 'node:test'
import assert from 'node:assert/strict'
import { translateValue } from './i18n.js'

test('translates Dutch map controls and dynamic route status into English', () => {
  assert.equal(translateValue('Mijn boot', 'en'), 'My boat')
  assert.equal(translateValue('Vaarbeweging 2 · Linksaf', 'en'), 'Sailing movement 2 · Turn left')
  assert.equal(translateValue('Routeplanning vermijdt 2 scheepvaartbeperkingen.', 'en'), 'Route avoids 2 shipping restrictions.')
  assert.equal(translateValue('Ingestuurd 12:00 · nog niet bijgevuld', 'en'), 'Submitted 12:00 · not restocked')
  assert.equal(translateValue('Geen fleetboot gevonden voor “Swaen”.', 'en'), 'No fleet boat found for “Swaen”.')
  assert.equal(translateValue('Bruggen langs de route', 'en'), 'Bridges along the route')
  assert.equal(translateValue('Geplande route', 'en'), 'Planned route')
})

test('translates English inventory and verification controls into Dutch', () => {
  assert.equal(translateValue('Issue stock to a boat', 'nl'), 'Voorraad aan een boot meegeven')
  assert.equal(translateValue('Open WhatsApp with message ready', 'nl'), 'Open WhatsApp met ingevuld bericht')
  assert.equal(translateValue('Which side is the boat coming from?', 'nl'), 'Van welke kant komt de boot?')
  assert.equal(translateValue('Bridges along the route', 'nl'), 'Bruggen langs de route')
})
