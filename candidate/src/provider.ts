import type { ExternalProvider } from "./types.js";

export class WireMockExternalProvider implements ExternalProvider {
  constructor(private readonly baseUrl = process.env.PROVIDER_BASE_URL ?? "http://localhost:8089") {}

  async performSideEffect(input: {
    sideEffectKey: string;
    accountId: string;
    objectId: string;
    eventType: string;
  }): Promise<{ providerRequestId: string; status: string }> {
    const response = await fetch(`${this.baseUrl}/provider/charges`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.sideEffectKey,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`provider returned ${response.status}`);
    }

    const body = await response.json() as { providerChargeId?: string; status?: string };
    return {
      providerRequestId: body.providerChargeId ?? `wiremock_${input.sideEffectKey}`,
      status: body.status ?? "accepted",
    };
  }
}
