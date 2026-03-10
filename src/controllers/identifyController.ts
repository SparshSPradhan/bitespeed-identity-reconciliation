import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IdentifyRequest, IdentifyResponse } from "../types";

const prisma = new PrismaClient();

export async function identify(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as IdentifyRequest;

    // Normalise inputs
    const email: string | null = body.email?.trim() || null;
    const phoneNumber: string | null = body.phoneNumber
      ? String(body.phoneNumber).trim()
      : null;

    // ── Step 1: Find all contacts matching the email OR phoneNumber ──────────
    const matchingContacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
    });

    // ── Step 2: No existing contacts → create brand new primary ─────────────
    if (matchingContacts.length === 0) {
      const newContact = await prisma.contact.create({
        data: { email, phoneNumber, linkPrecedence: "primary" },
      });

      res.status(200).json({
        contact: {
          primaryContatctId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
          secondaryContactIds: [],
        },
      } as IdentifyResponse);
      return;
    }

    // ── Step 3: Resolve the primary ID for every matched contact ─────────────
    // A matched contact could be secondary — its primaryId is in linkedId
    const primaryIds = new Set<number>();
    for (const contact of matchingContacts) {
      if (contact.linkPrecedence === "primary") {
        primaryIds.add(contact.id);
      } else if (contact.linkedId !== null) {
        primaryIds.add(contact.linkedId);
      }
    }

    // ── Step 4: Fetch every contact belonging to all matched clusters ─────────
    const allClusterContacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [
          { id: { in: Array.from(primaryIds) } },
          { linkedId: { in: Array.from(primaryIds) } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // ── Step 5: Find the single true primary (oldest createdAt) ──────────────
    const primaries = allClusterContacts
      .filter((c) => c.linkPrecedence === "primary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const truePrimary = primaries[0];
    const newerPrimaries = primaries.slice(1);

    // ── Step 6: Merge — demote newer primaries to secondary ──────────────────
    if (newerPrimaries.length > 0) {
      const newerPrimaryIds = newerPrimaries.map((p) => p.id);

      // The newer primaries themselves become secondary
      await prisma.contact.updateMany({
        where: { id: { in: newerPrimaryIds } },
        data: {
          linkPrecedence: "secondary",
          linkedId: truePrimary.id,
          updatedAt: new Date(),
        },
      });

      // Re-point any contacts that were linked to a now-demoted primary
      await prisma.contact.updateMany({
        where: { linkedId: { in: newerPrimaryIds }, deletedAt: null },
        data: { linkedId: truePrimary.id, updatedAt: new Date() },
      });
    }

    // ── Step 7: Check if the request brings NEW information ──────────────────
    const allEmails = new Set(
      allClusterContacts.map((c) => c.email).filter(Boolean) as string[]
    );
    const allPhones = new Set(
      allClusterContacts.map((c) => c.phoneNumber).filter(Boolean) as string[]
    );

    const isNewEmail = email !== null && !allEmails.has(email);
    const isNewPhone = phoneNumber !== null && !allPhones.has(phoneNumber);

    if (isNewEmail || isNewPhone) {
      await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkedId: truePrimary.id,
          linkPrecedence: "secondary",
        },
      });
    }

    // ── Step 8: Re-fetch final cluster after all updates ─────────────────────
    const finalContacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: truePrimary.id }, { linkedId: truePrimary.id }],
      },
      orderBy: { createdAt: "asc" },
    });

    // Build response — primary's values come first, then secondaries (deduped)
    const primaryContact = finalContacts.find((c) => c.id === truePrimary.id)!;
    const secondaryContacts = finalContacts.filter((c) => c.id !== truePrimary.id);

    const emailsOrdered: string[] = [];
    const phonesOrdered: string[] = [];
    const secondaryIds: number[] = [];

    if (primaryContact.email) emailsOrdered.push(primaryContact.email);
    if (primaryContact.phoneNumber) phonesOrdered.push(primaryContact.phoneNumber);

    const seenEmails = new Set(emailsOrdered);
    const seenPhones = new Set(phonesOrdered);

    for (const c of secondaryContacts) {
      secondaryIds.push(c.id);
      if (c.email && !seenEmails.has(c.email)) {
        emailsOrdered.push(c.email);
        seenEmails.add(c.email);
      }
      if (c.phoneNumber && !seenPhones.has(c.phoneNumber)) {
        phonesOrdered.push(c.phoneNumber);
        seenPhones.add(c.phoneNumber);
      }
    }

    res.status(200).json({
      contact: {
        primaryContatctId: truePrimary.id,
        emails: emailsOrdered,
        phoneNumbers: phonesOrdered,
        secondaryContactIds: secondaryIds,
      },
    } as IdentifyResponse);

  } catch (error) {
    console.error("[identify] Error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Something went wrong. Please try again.",
    });
  }
}