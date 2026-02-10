/**
 * SeQRets JavaCard Applet — Secure Storage for Shamir Shares & Vaults
 *
 * A simple, auditable storage applet for JavaCard 3.0.4+ (JCOP3 J3H145).
 * All cryptographic operations happen on the desktop — this applet only
 * stores and retrieves opaque data blobs with optional PIN protection.
 *
 * AID: F0 53 51 52 54 53 01
 * CLA: 0x80 (proprietary)
 *
 * APDU Commands:
 *   INS 0x01  STORE_DATA    — Write data in chunks (P1=chunk#, P2=0x00 more / 0x01 last)
 *   INS 0x02  READ_DATA     — Read data in chunks (P1=chunk#)
 *   INS 0x03  GET_STATUS    — Returns metadata (length, type, label, pin state)
 *   INS 0x04  ERASE_DATA    — Clear all stored data
 *   INS 0x10  SET_TYPE      — Set data type byte (P1=type: 0x01=share, 0x02=vault)
 *   INS 0x11  SET_LABEL     — Set label string (data field = UTF-8 label, max 64 bytes)
 *   INS 0x20  VERIFY_PIN    — Verify PIN (data = PIN bytes)
 *   INS 0x21  CHANGE_PIN    — Change PIN (P1=old len, data = old+new)
 *   INS 0x22  SET_PIN       — Initial PIN setup (only if no PIN set)
 *
 * @author seQRets
 * @version 1.0
 */
package com.seqrets.card;

import javacard.framework.*;
import javacard.security.*;

public class SeQRetsApplet extends Applet {

    // ── INS codes ──────────────────────────────────────────────────────
    private static final byte INS_STORE_DATA   = (byte) 0x01;
    private static final byte INS_READ_DATA    = (byte) 0x02;
    private static final byte INS_GET_STATUS   = (byte) 0x03;
    private static final byte INS_ERASE_DATA   = (byte) 0x04;
    private static final byte INS_SET_TYPE     = (byte) 0x10;
    private static final byte INS_SET_LABEL    = (byte) 0x11;
    private static final byte INS_VERIFY_PIN   = (byte) 0x20;
    private static final byte INS_CHANGE_PIN   = (byte) 0x21;
    private static final byte INS_SET_PIN      = (byte) 0x22;

    // ── Constants ──────────────────────────────────────────────────────
    private static final byte CLA_PROPRIETARY  = (byte) 0x80;
    private static final short MAX_DATA_SIZE   = (short) 8192;
    private static final byte MAX_LABEL_SIZE   = (byte) 64;
    private static final byte MAX_PIN_SIZE     = (byte) 16;
    private static final byte MIN_PIN_SIZE     = (byte) 8;
    private static final byte MAX_PIN_RETRIES  = (byte) 3;
    private static final short CHUNK_SIZE      = (short) 240;

    // ── Data type constants ────────────────────────────────────────────
    private static final byte TYPE_EMPTY       = (byte) 0x00;
    private static final byte TYPE_SHARE       = (byte) 0x01;
    private static final byte TYPE_VAULT       = (byte) 0x02;

    // ── Persistent storage (EEPROM) ────────────────────────────────────
    private byte[] storedData;
    private short  dataLength;
    private byte   dataType;
    private byte[] label;
    private byte   labelLength;
    private byte[] pin;
    private byte   pinLength;
    private byte   pinRetries;
    private boolean pinSet;

    // ── Transient storage (RAM — clears on deselect) ───────────────────
    private boolean[] pinVerified;

    /**
     * Private constructor — called from install().
     */
    private SeQRetsApplet() {
        storedData  = new byte[MAX_DATA_SIZE];
        dataLength  = (short) 0;
        dataType    = TYPE_EMPTY;
        label       = new byte[MAX_LABEL_SIZE];
        labelLength = (byte) 0;
        pin         = new byte[MAX_PIN_SIZE];
        pinLength   = (byte) 0;
        pinRetries  = MAX_PIN_RETRIES;
        pinSet      = false;

        // Transient array — clears when applet is deselected (card removed)
        pinVerified = JCSystem.makeTransientBooleanArray((short) 1, JCSystem.CLEAR_ON_DESELECT);
        pinVerified[0] = false;

        register();
    }

    /**
     * Applet installation entry point.
     */
    public static void install(byte[] bArray, short bOffset, byte bLength) {
        new SeQRetsApplet();
    }

    /**
     * Called when the applet is selected. Reset PIN verification state.
     */
    public boolean select() {
        pinVerified[0] = false;
        return true;
    }

    /**
     * Called when the applet is deselected.
     */
    public void deselect() {
        pinVerified[0] = false;
    }

    /**
     * Main APDU processing — dispatches to handler methods.
     */
    public void process(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        // Handle standard SELECT APDU
        if (selectingApplet()) {
            return;
        }

        // Verify CLA
        if (buffer[ISO7816.OFFSET_CLA] != CLA_PROPRIETARY) {
            ISOException.throwIt(ISO7816.SW_CLA_NOT_SUPPORTED);
        }

        byte ins = buffer[ISO7816.OFFSET_INS];

        switch (ins) {
            case INS_STORE_DATA:
                checkPinIfRequired();
                processStoreData(apdu);
                break;
            case INS_READ_DATA:
                checkPinIfRequired();
                processReadData(apdu);
                break;
            case INS_GET_STATUS:
                processGetStatus(apdu);
                break;
            case INS_ERASE_DATA:
                checkPinIfRequired();
                processEraseData(apdu);
                break;
            case INS_SET_TYPE:
                checkPinIfRequired();
                processSetType(apdu);
                break;
            case INS_SET_LABEL:
                checkPinIfRequired();
                processSetLabel(apdu);
                break;
            case INS_VERIFY_PIN:
                processVerifyPin(apdu);
                break;
            case INS_CHANGE_PIN:
                processChangePin(apdu);
                break;
            case INS_SET_PIN:
                processSetPin(apdu);
                break;
            default:
                ISOException.throwIt(ISO7816.SW_INS_NOT_SUPPORTED);
        }
    }

    // ── PIN check helper ───────────────────────────────────────────────

    /**
     * If PIN is set and not yet verified this session, throw security error.
     */
    private void checkPinIfRequired() {
        if (pinSet && !pinVerified[0]) {
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }
    }

    // ── STORE_DATA (INS 0x01) ──────────────────────────────────────────

    /**
     * Write a chunk of data.
     * P1 = chunk index (0-based)
     * P2 = 0x00 (more chunks follow) or 0x01 (last chunk)
     * Data = up to 240 bytes of payload
     */
    private void processStoreData(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        byte p1 = buffer[ISO7816.OFFSET_P1]; // chunk index
        byte p2 = buffer[ISO7816.OFFSET_P2]; // 0x00=more, 0x01=last

        short bytesRead = apdu.setIncomingAndReceive();
        short dataOffset = ISO7816.OFFSET_CDATA;

        // If chunk 0, we're starting fresh — clear existing data
        if (p1 == (byte) 0x00) {
            dataLength = (short) 0;
        }

        // Calculate write offset from chunk index
        short writeOffset = (short) (p1 * CHUNK_SIZE);

        // Bounds check
        if ((short) (writeOffset + bytesRead) > MAX_DATA_SIZE) {
            ISOException.throwIt(ISO7816.SW_FILE_FULL);
        }

        // Copy data to EEPROM
        Util.arrayCopy(buffer, dataOffset, storedData, writeOffset, bytesRead);

        // Update total length
        short newEnd = (short) (writeOffset + bytesRead);
        if (newEnd > dataLength) {
            dataLength = newEnd;
        }
    }

    // ── READ_DATA (INS 0x02) ───────────────────────────────────────────

    /**
     * Read a chunk of data.
     * P1 = chunk index (0-based)
     * Returns up to 240 bytes. SW=0x6100 if more data available.
     */
    private void processReadData(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        byte p1 = buffer[ISO7816.OFFSET_P1]; // chunk index

        if (dataLength == (short) 0) {
            ISOException.throwIt(ISO7816.SW_CONDITIONS_NOT_SATISFIED);
        }

        short readOffset = (short) (p1 * CHUNK_SIZE);

        if (readOffset >= dataLength) {
            ISOException.throwIt(ISO7816.SW_WRONG_P1P2);
        }

        short remaining = (short) (dataLength - readOffset);
        short sendLen = (remaining > CHUNK_SIZE) ? CHUNK_SIZE : remaining;

        Util.arrayCopy(storedData, readOffset, buffer, (short) 0, sendLen);

        apdu.setOutgoingAndSend((short) 0, sendLen);
    }

    // ── GET_STATUS (INS 0x03) ──────────────────────────────────────────

    /**
     * Returns card metadata:
     *   [0-1]  data length (2 bytes, big-endian)
     *   [2]    data type (0x00=empty, 0x01=share, 0x02=vault)
     *   [3]    pin set flag (0x00=no, 0x01=yes)
     *   [4]    pin verified flag (0x00=no, 0x01=yes)
     *   [5]    label length (1 byte)
     *   [6..]  label bytes (up to 64)
     */
    private void processGetStatus(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        short offset = (short) 0;

        // Data length (2 bytes, big-endian)
        Util.setShort(buffer, offset, dataLength);
        offset += 2;

        // Data type
        buffer[offset++] = dataType;

        // PIN set flag
        buffer[offset++] = pinSet ? (byte) 0x01 : (byte) 0x00;

        // PIN verified flag
        buffer[offset++] = pinVerified[0] ? (byte) 0x01 : (byte) 0x00;

        // Label length
        buffer[offset++] = labelLength;

        // Label data
        if (labelLength > 0) {
            Util.arrayCopy(label, (short) 0, buffer, offset, (short) labelLength);
            offset += labelLength;
        }

        apdu.setOutgoingAndSend((short) 0, offset);
    }

    // ── ERASE_DATA (INS 0x04) ──────────────────────────────────────────

    /**
     * Clear all stored data and metadata. Overwrites with zeros.
     */
    private void processEraseData(APDU apdu) {
        Util.arrayFillNonAtomic(storedData, (short) 0, MAX_DATA_SIZE, (byte) 0x00);
        dataLength = (short) 0;
        dataType = TYPE_EMPTY;
        Util.arrayFillNonAtomic(label, (short) 0, MAX_LABEL_SIZE, (byte) 0x00);
        labelLength = (byte) 0;
    }

    // ── SET_TYPE (INS 0x10) ────────────────────────────────────────────

    /**
     * Set the data type. P1 = type byte (0x01=share, 0x02=vault).
     */
    private void processSetType(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        byte type = buffer[ISO7816.OFFSET_P1];

        if (type != TYPE_SHARE && type != TYPE_VAULT) {
            ISOException.throwIt(ISO7816.SW_WRONG_P1P2);
        }

        dataType = type;
    }

    // ── SET_LABEL (INS 0x11) ───────────────────────────────────────────

    /**
     * Set the label. Data field = UTF-8 label bytes, max 64.
     */
    private void processSetLabel(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        short bytesRead = apdu.setIncomingAndReceive();

        if (bytesRead > MAX_LABEL_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        Util.arrayFillNonAtomic(label, (short) 0, MAX_LABEL_SIZE, (byte) 0x00);
        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA, label, (short) 0, bytesRead);
        labelLength = (byte) bytesRead;
    }

    // ── VERIFY_PIN (INS 0x20) ──────────────────────────────────────────

    /**
     * Verify the PIN. Data = PIN bytes.
     * If retries exhausted, card locks PIN permanently.
     */
    private void processVerifyPin(APDU apdu) {
        if (!pinSet) {
            // No PIN set — nothing to verify, succeed
            pinVerified[0] = true;
            return;
        }

        if (pinRetries == (byte) 0) {
            ISOException.throwIt(ISO7816.SW_FILE_INVALID); // Locked out
        }

        byte[] buffer = apdu.getBuffer();
        short bytesRead = apdu.setIncomingAndReceive();

        if (bytesRead != (short) pinLength) {
            pinRetries--;
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }

        if (Util.arrayCompare(buffer, ISO7816.OFFSET_CDATA, pin, (short) 0, (short) pinLength) == 0) {
            pinVerified[0] = true;
            pinRetries = MAX_PIN_RETRIES; // Reset retries on success
        } else {
            pinRetries--;
            pinVerified[0] = false;
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }
    }

    // ── CHANGE_PIN (INS 0x21) ──────────────────────────────────────────

    /**
     * Change PIN. Must be currently verified.
     * P1 = old PIN length
     * Data = old PIN bytes + new PIN bytes
     */
    private void processChangePin(APDU apdu) {
        if (!pinSet) {
            ISOException.throwIt(ISO7816.SW_CONDITIONS_NOT_SATISFIED);
        }
        if (!pinVerified[0]) {
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }

        byte[] buffer = apdu.getBuffer();
        short bytesRead = apdu.setIncomingAndReceive();
        byte oldPinLen = buffer[ISO7816.OFFSET_P1];
        short newPinLen = (short) (bytesRead - oldPinLen);

        // Validate old PIN
        if (oldPinLen != pinLength ||
            Util.arrayCompare(buffer, ISO7816.OFFSET_CDATA, pin, (short) 0, (short) pinLength) != 0) {
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }

        // Validate new PIN length
        if (newPinLen < MIN_PIN_SIZE || newPinLen > MAX_PIN_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        // Store new PIN
        Util.arrayFillNonAtomic(pin, (short) 0, MAX_PIN_SIZE, (byte) 0x00);
        Util.arrayCopy(buffer, (short) (ISO7816.OFFSET_CDATA + oldPinLen), pin, (short) 0, newPinLen);
        pinLength = (byte) newPinLen;
        pinRetries = MAX_PIN_RETRIES;
    }

    // ── SET_PIN (INS 0x22) ─────────────────────────────────────────────

    /**
     * Initial PIN setup. Only works if no PIN is currently set.
     * Data = new PIN bytes (4-8 bytes).
     */
    private void processSetPin(APDU apdu) {
        if (pinSet) {
            ISOException.throwIt(ISO7816.SW_CONDITIONS_NOT_SATISFIED);
        }

        byte[] buffer = apdu.getBuffer();
        short bytesRead = apdu.setIncomingAndReceive();

        if (bytesRead < MIN_PIN_SIZE || bytesRead > MAX_PIN_SIZE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA, pin, (short) 0, bytesRead);
        pinLength = (byte) bytesRead;
        pinSet = true;
        pinRetries = MAX_PIN_RETRIES;
        pinVerified[0] = true; // Auto-verify after initial setup
    }
}
