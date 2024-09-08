"use client";

import React, { useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/core";
import { cccA } from "@ckb-ccc/core/advanced";
import { Node, Edge, ForceGraph } from "./forceGraph";

const client = new ccc.ClientPublicMainnet();
const explorer = "https://explorer.nervos.org";

async function addAddress(
  address: string,
  addresses: Node[],
  setAddresses: (setter: (addresses: Node[]) => Node[]) => void
) {
  if (addresses.some((a) => a.id === address)) {
    return;
  }

  const { script } = await ccc.Address.fromString(address, client);
  const capacity = await client.getCellsCapacity({
    script,
    scriptSearchMode: "exact",
    scriptType: "lock",
  });
  setAddresses((addresses) => {
    if (addresses.some((a) => a.id === address)) {
      return addresses;
    }

    const hash = script.hash();
    const color = `hsl(${(
      ccc.numFrom(hash) % ccc.numFrom(360)
    ).toString()} 65% 45%)`;
    const type = Object.entries(cccA.MAINNET_SCRIPTS).find(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ([_, s]) =>
        script.codeHash === s?.codeHash && script.hashType === s?.hashType
    );
    return [
      ...addresses,
      {
        id: address,
        balance: capacity,
        loaded: 0,
        hasMore: "INITED",
        type: type?.[0] ?? "Unknown",
        color,
        size: Math.max(-2, Math.log10(Number(capacity / ccc.One))) * 4 + 24,
        x: 0,
        y: 0,
      },
    ];
  });
}

function addEdge(
  source: string,
  target: string,
  volume: ccc.Num,
  setEdges: (setter: (edges: Edge[]) => Edge[]) => void
) {
  setEdges((edges) => {
    let existed = edges.find(
      (e) => e.sourceId === source && e.targetId === target
    );
    if (!existed) {
      existed = {
        source,
        target,
        sourceId: source,
        targetId: target,
        value: volume,
      };
      return [...edges, existed];
    } else {
      existed.value += volume;
      return [...edges];
    }
  });
}

export default function Home() {
  const [addresses, setAddresses] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setTxs] = useState<Set<string>>(new Set());

  const [distance, setDistance] = useState<string>("450");
  const [loadLimit, setLoadLimit] = useState<string>("100");
  const [address, setAddress] = useState<string>("");

  useEffect(() => {
    addAddress(
      "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0w7teyh77d48krwz2837wwejrppzw905cm588n0",
      addresses,
      setAddresses
    );
  }, []);

  return (
    <div className="w-full h-dvh flex flex-col">
      <div className="w-full grow overflow-auto">
        <ForceGraph
          nodes={addresses}
          edges={edges}
          distance={Number(distance)}
          onAddInputs={(node) => {
            (async () => {
              const { script } = await ccc.Address.fromString(node.id, client);

              const { transactions, lastCursor } =
                await client.findTransactionsPaged(
                  {
                    script,
                    scriptType: "lock",
                    scriptSearchMode: "exact",
                    groupByTransaction: true,
                  },
                  "asc",
                  loadLimit,
                  node.hasMore === "INITED" ? undefined : node.hasMore
                );
              const hasMore =
                transactions.length !== 0 &&
                transactions.length >= Number(loadLimit);
              node.loaded += transactions.length;
              node.hasMore = hasMore ? lastCursor : undefined;
              await Promise.all(
                transactions.map(async ({ txHash }) => {
                  while (true) {
                    try {
                      const tx = await client.getTransaction(txHash);
                      if (!tx) {
                        return;
                      }
                      await Promise.all(
                        tx.transaction.inputs.map((i) =>
                          i.completeExtraInfos(client)
                        )
                      );
                      const spendVolume = tx.transaction.inputs
                        .filter((i) => i.cellOutput!.lock.eq(script))
                        .reduce(
                          (acc, i) => acc + i.cellOutput!.capacity,
                          ccc.Zero
                        );
                      const gotVolume = tx.transaction.outputs
                        .filter((o) => o.lock.eq(script))
                        .reduce((acc, o) => acc + o.capacity, ccc.Zero);

                      if (spendVolume > gotVolume) {
                        await Promise.all(
                          Array.from(
                            new Set(
                              tx.transaction.outputs.map((o) =>
                                ccc.Address.fromScript(
                                  o.lock,
                                  client
                                ).toString()
                              )
                            ),
                            (to) =>
                              addAddress(to, addresses, setAddresses).then(
                                () => {
                                  setTxs((txs) => {
                                    const key = `${txHash}${node.id}${to}`;
                                    if (txs.has(key)) {
                                      return txs;
                                    }
                                    txs.add(key);
                                    addEdge(
                                      node.id,
                                      to,
                                      spendVolume - gotVolume,
                                      setEdges
                                    );
                                    return txs;
                                  });
                                }
                              )
                          )
                        );
                      }
                      if (gotVolume > spendVolume) {
                        await Promise.all(
                          Array.from(
                            new Set(
                              tx.transaction.inputs.map((i) =>
                                ccc.Address.fromScript(
                                  i.cellOutput!.lock,
                                  client
                                ).toString()
                              )
                            ),
                            async (from) => {
                              await addAddress(from, addresses, setAddresses);
                              setTxs((txs) => {
                                const key = `${txHash}${from}${node.id}`;
                                if (txs.has(key)) {
                                  return txs;
                                }
                                txs.add(key);
                                addEdge(
                                  from,
                                  node.id,
                                  gotVolume - spendVolume,
                                  setEdges
                                );
                                return txs;
                              });
                            }
                          )
                        );
                      }
                      break;
                    } catch (err) {
                      console.log(err);
                    }
                  }
                })
              );
            })();
          }}
          onOpen={(node) =>
            window.open(`${explorer}/address/${node.id}`, "_blank")
          }
        />
      </div>
      <div className="bg-[#000] p-4 text-white">
        Distance
        <input
          className="mx-2 text-[#000] px-2"
          placeholder="Distance"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
        />
        Load Limit
        <input
          className="mx-2 text-[#000] px-2"
          placeholder="Load Limit"
          value={loadLimit}
          onChange={(e) => setLoadLimit(e.target.value)}
        />
        <button
          className="bg-blue-400 px-2"
          onClick={() => addAddress(address, addresses, setAddresses)}
        >
          Add Address
        </button>
        <input
          className="mx-2 text-[#000] px-2"
          placeholder="Address to add"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
    </div>
  );
}
