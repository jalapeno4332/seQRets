'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Shield, ShieldCheck, AlertTriangle, Check, Minus, ExternalLink } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Header } from "../components/header";
import { AppFooter } from "../components/app-footer";

const features = [
    { name: 'XChaCha20-Poly1305 encryption', web: true, desktop: true },
    { name: "Shamir's Secret Sharing", web: true, desktop: true },
    { name: 'Argon2id password hashing', web: true, desktop: true },
    { name: 'Optional keyfile (second factor)', web: true, desktop: true },
    { name: 'Built-in 209-bit password generator', web: true, desktop: true },
    { name: 'BIP-39 seed phrase support', web: true, desktop: true },
    { name: 'Inheritance Plan (file upload)', web: true, desktop: true },
    { name: 'Camera QR scanning', web: true, desktop: true },
    { name: 'Works offline after load', web: true, desktop: true },
    { name: 'Inheritance Plan (in-app builder)', web: false, desktop: true },
    { name: 'JavaCard smart card support', web: false, desktop: true },
    { name: 'Visible Qard integrity verification', web: false, desktop: true },
    { name: 'Printed SHA-256 fingerprint on every Qard', web: false, desktop: true },
    { name: 'Encryption runs outside the browser', web: false, desktop: true },
    { name: 'Securely erases keys from memory', web: false, desktop: true },
    { name: 'Safe from malicious browser add-ons', web: false, desktop: true },
    { name: 'Code signed for macOS & Windows (at launch)', web: false, desktop: true },
    { name: 'Automatic updates', web: false, desktop: true },
];

export default function GoProPage() {
    return (
        <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
            <div className="w-full max-w-4xl mx-auto relative">
                <div className="absolute top-4 left-4 z-50">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to App
                        </Link>
                    </Button>
                </div>
                <Header />

                {/* Hero */}
                <div className="text-center mb-10 pt-16 sm:pt-0">
                    <div className="flex justify-center items-center gap-2.5 mb-6">
                        <Image src="/icons/logo-light.webp" alt="seQRets Logo" width={144} height={144} className="self-start -mt-2 dark:hidden" priority />
                        <Image src="/icons/logo-dark.webp" alt="seQRets Logo" width={144} height={144} className="self-start -mt-2 hidden dark:block" priority />
                        <div>
                            <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
                                seQRets
                            </h1>
                            <p className="text-right text-base font-bold text-foreground tracking-wide">
                                Secure. Split. Share.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-3 mb-3 flex-wrap">
                        <Rocket className="h-10 w-10 md:h-12 md:w-12 text-primary" />
                        <h2 className="text-4xl md:text-5xl font-bold">Go Pro</h2>
                        <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-red-500">
                            <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                            Coming Soon
                        </span>
                    </div>
                    <p className="text-muted-foreground max-w-xl mx-auto">
                        The seQRets desktop app — maximum security for your most valuable secrets.
                    </p>
                </div>

                {/* Why Upgrade */}
                <Card className="mb-6">
                    <CardHeader className="md:px-8 md:pt-8">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="h-6 w-6 text-[hsl(42,85%,45%)] dark:text-primary" />
                            <CardTitle>Why the Desktop App?</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-4 md:px-8 md:pb-8">
                        <p>
                            The seQRets web app uses the best available technology to safely secure your most important data. But browser-based apps <span className="font-semibold text-foreground">DO</span> have weaknesses that no amount of preparation and testing can fully fix:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="px-4 py-6 rounded-lg border bg-muted/30">
                                <p className="font-semibold text-foreground mb-1 text-base">Browser Extensions</p>
                                <p className="text-sm">Malicious browser extensions can secretly watch what you type and steal what you copy. No website can stop them.</p>
                            </div>
                            <div className="px-4 py-6 rounded-lg border bg-muted/30">
                                <p className="font-semibold text-foreground mb-1 text-base">Browser Memory</p>
                                <p className="text-sm">Your password leaves a faint trace in your browser&apos;s memory that we can&apos;t fully wipe. The trace lingers until you close the tab &mdash; sometimes longer.</p>
                            </div>
                            <div className="px-4 py-6 rounded-lg border bg-muted/30">
                                <p className="font-semibold text-foreground mb-1 text-base">Code Delivery</p>
                                <p className="text-sm">When you first visit, or update, the seQRets web app, your browser downloads fresh code via Cloudflare. In theory, that code could be tampered with &mdash; a threat known as a supply chain attack.</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 pt-2 border-t">
                            <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0" />
                            <p>
                                The <span className="font-semibold text-foreground">seQRets Desktop App</span>{' '}eliminates all three threats.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Feature Comparison */}
                <Card className="mb-6">
                    <CardHeader className="md:px-8 md:pt-10 md:pb-2">
                        <div className="flex items-center gap-3">
                            <Shield className="h-6 w-6 text-[hsl(42,85%,45%)] dark:text-primary" />
                            <CardTitle>Feature Comparison</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 sm:px-8 sm:pb-8 sm:pt-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-3 font-semibold">Feature</th>
                                        <th className="text-center p-3 font-semibold w-24">Web</th>
                                        <th className="text-center p-3 font-semibold w-24 text-primary">Desktop</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {features.map((f, i) => (
                                        <tr key={i} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                                            <td className="p-3 text-muted-foreground">{f.name}</td>
                                            <td className="p-3 text-center">
                                                {f.web
                                                    ? <Check className="h-4 w-4 text-green-600 mx-auto" strokeWidth={3} />
                                                    : <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                                                }
                                            </td>
                                            <td className="p-3 text-center">
                                                {f.desktop
                                                    ? <Check className="h-4 w-4 text-green-600 mx-auto" strokeWidth={3} />
                                                    : <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Desktop-Only Highlights */}
                <Card className="mb-8">
                    <CardHeader className="md:px-8 md:pt-8">
                        <div className="flex items-center gap-3">
                            <Rocket className="h-6 w-6 text-[hsl(42,85%,45%)] dark:text-primary" />
                            <CardTitle>Desktop Exclusives</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-3 md:px-8 md:pb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" strokeWidth={3} />
                                <p><span className="font-semibold text-foreground">Inheritance Plan builder</span>{' '}&mdash; a guided 9-section form covering everything your heirs need, encrypted to a file that fits on a smart card.</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" strokeWidth={3} />
                                <p><span className="font-semibold text-foreground">JavaCard smart card support</span>{' '}&mdash; store Qards, vaults, and plans on a physical smart card with PIN protection. Same chip used in EMV credit cards and ePassports.</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" strokeWidth={3} />
                                <p><span className="font-semibold text-foreground">Encryption runs natively</span>{' '}&mdash; encryption happens outside the browser. Your password and keys never enter browser memory and are erased the moment they&apos;re done.</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" strokeWidth={3} />
                                <p><span className="font-semibold text-foreground">Clone card &amp; Smart Card Manager</span>{' '}&mdash; manage PINs, copy between readers, delete items, and factory-reset cards from one page.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CTA */}
                <div className="text-center mb-8">
                    <a href="https://seqrets.app/shop" target="_blank" rel="noopener noreferrer">
                        <Button size="lg" className="text-lg px-8 py-6 bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-lg transition-all">
                            Coming Soon — seQRets Desktop
                            <Rocket className="ml-2 h-5 w-5" />
                        </Button>
                    </a>
                </div>

                <AppFooter />
            </div>
        </main>
    );
}
