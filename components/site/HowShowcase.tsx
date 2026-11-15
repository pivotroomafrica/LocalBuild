"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type ShowcaseFace = { name: string; photoUrl: string };

type Scene = "call" | "inperson" | "match";

const CALL_CARDS: { scene: Scene; href: string; icon: string; title: string; body: string }[] = [
  {
    scene: "call",
    href: "/how-we-help/expert-calls",
    icon: "video_chat",
    title: "Expert calls",
    body: "A private one-to-one video call with someone who has the experience your question needs.",
  },
  {
    scene: "inperson",
    href: "/how-we-help/in-person-meetings",
    icon: "handshake",
    title: "In-person meetings",
    body: "Meet the expert face to face, at their office or yours, for a deeper working session.",
  },
  {
    scene: "match",
    href: "/how-we-help/finding-the-right-expert",
    icon: "person_search",
    title: "Finding the right expert",
    body: "Search by the problem you're facing and compare vetted experts' experience, prices and open times.",
  },
];

const CONTENT_ITEMS = [
  {
    icon: "local_library",
    title: "Library",
    body: "Read and listen to expert insight on Ethiopian markets, sectors and regulation, all in one place.",
  },
  {
    icon: "podcasts",
    title: "Private podcast interviews",
    body: "In-depth recorded interviews with experts, available privately to Pivotroom clients.",
  },
  {
    icon: "ballot",
    title: "Surveys",
    body: "Ask many vetted experts at once to test an idea, check a price or size a market.",
  },
];

const EVENT_ITEMS = [
  {
    icon: "tour",
    title: "In-person roundtables & site tours",
    body: "Small groups meeting experts in person, including visits to farms, factories and offices.",
  },
  {
    icon: "co_present",
    title: "Summits & seminars",
    body: "Larger sessions where experts share what they know with a room of founders and teams.",
  },
  {
    icon: "emoji_objects",
    title: "Virtual roundtables & idea storming rooms",
    body: "Online sessions where several experts work through one question together with your team.",
  },
];

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Counts up from 00:00:00 while the call scene is showing. */
function CallTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="hws-pill">
      <span className="hws-rec" />
      {pad(Math.floor(seconds / 3600))}:{pad(Math.floor(seconds / 60) % 60)}:{pad(seconds % 60)}
    </span>
  );
}

function CallScene({ faces }: { faces: ShowcaseFace[] }) {
  const [main, ...rest] = faces;
  if (!main) {
    return (
      <div className="hws-art tint">
        {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
        <img src="/images/how-1.svg" alt="" className="hws-illo" />
      </div>
    );
  }
  return (
    <div className="hws-art call">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
      <img src={main.photoUrl} alt="" className="hws-main" />
      <div className="hws-top">
        <span className="hws-pill round">
          <span className="ms">volume_up</span>
        </span>
        <CallTimer />
      </div>
      <span className="hws-name">{firstName(main.name)}</span>
      {rest.length > 0 ? (
        <div className="hws-strip">
          {rest.slice(0, 3).map((face, index) => (
            <span key={index} className="hws-tile">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              <img src={face.photoUrl} alt="" />
              <span>{firstName(face.name)}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="hws-controls">
        <span className="ms">mic</span>
        <span className="ms">videocam</span>
        <span className="ms end">call_end</span>
      </div>
    </div>
  );
}

function InPersonScene() {
  return (
    <div className="hws-art tint">
      {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
      <img src="/images/how-4.svg" alt="" className="hws-illo" />
      <div className="hws-float a">
        <span className="ms">location_on</span>
        At their office or yours
      </div>
      <div className="hws-float b">
        <span className="ms">event_available</span>
        Booked from 24 hours ahead
      </div>
    </div>
  );
}

function MatchScene({ topics }: { topics: string[] }) {
  return (
    <div className="hws-art tint">
      <div className="hws-search">
        <span className="ms">search</span>
        What are you working on?
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
      <img src="/images/how-2.svg" alt="" className="hws-illo sm" />
      {topics.length > 0 ? (
        <div className="hws-chips">
          {topics.slice(0, 6).map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContentArt() {
  const bars = [8, 18, 26, 14, 30, 22, 10, 28, 16, 24, 12, 30, 20, 8, 26, 18, 12, 22, 28, 14];
  return (
    <div className="hws-art navy">
      <span className="hws-soon">Coming soon</span>
      <div className="hws-player">
        <span className="hws-play">
          <span className="ms">pause</span>
        </span>
        <span className="hws-wave">
          {bars.map((height, index) => (
            <i key={index} style={{ height }} className={index < 9 ? "on" : undefined} />
          ))}
        </span>
        <span className="hws-ptime">Episode 1</span>
      </div>
      <div className="hws-transcript">
        <div className="hws-who">
          <span className="ms">person</span>
          You
        </div>
        <span className="hws-line w90 mark" />
        <span className="hws-line w70" />
        <div className="hws-who dim">
          <span className="ms">verified</span>
          Expert
        </div>
        <span className="hws-line w80 dim" />
        <span className="hws-line w60 dim" />
      </div>
    </div>
  );
}

function EventsArt({ faces }: { faces: ShowcaseFace[] }) {
  return (
    <div className="hws-art warm">
      <span className="hws-soon">Coming soon</span>
      <div className="hws-ticket">
        <span className="hws-ticket-kicker">Pivotroom roundtable</span>
        <span className="hws-ticket-title">Experts and founders, one table</span>
        <span className="hws-ticket-row">
          <span className="ms">calendar_month</span>
          Dates to be announced
        </span>
        <span className="hws-ticket-row">
          <span className="ms">location_on</span>
          In person and online
        </span>
        <span className="hws-seats">
          {faces.slice(0, 4).map((face, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img key={index} src={face.photoUrl} alt="" />
          ))}
          <span className="hws-seat-open">
            <span className="ms">add</span>
          </span>
        </span>
      </div>
    </div>
  );
}

function SoonCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="hws-card soon">
      <span className="hws-card-head">
        <span className="ms hws-card-ic">{icon}</span>
        <span className="hws-card-title">{title}</span>
        <span className="hws-badge">Coming soon</span>
      </span>
      <span className="hws-card-body">{body}</span>
    </div>
  );
}

/**
 * How we help, GLG-style: text and cards on one side, a picture area on the
 * other. In the calls section, hovering or focusing a card changes the
 * picture; each card opens its own page.
 */
export function HowShowcase({ faces, topics }: { faces: ShowcaseFace[]; topics: string[] }) {
  const [scene, setScene] = useState<Scene>("call");

  return (
    <>
      <section className="hws-sec" style={{ background: "#f6f6f4" }}>
        <div className="wrap hws-grid">
          <div className="hws-text">
            <h2 className="hws-h2">Expert calls &amp; meetings</h2>
            <p className="hws-lead">
              Talk to an expert online or in person to test your plan, check your numbers and get straight answers from
              someone who has done it before.
            </p>
            <div>
              <Link href="/how-we-help/expert-calls" className="btn btn-ink">
                Learn more about expert calls
              </Link>
            </div>
            <div className="hws-cards">
              {CALL_CARDS.map((card) => (
                <Link
                  key={card.scene}
                  href={card.href}
                  className={scene === card.scene ? "hws-card active" : "hws-card"}
                  onMouseEnter={() => setScene(card.scene)}
                  onFocus={() => setScene(card.scene)}
                >
                  <span className="hws-card-head">
                    <span className="ms hws-card-ic">{card.icon}</span>
                    <span className="hws-card-title">{card.title}</span>
                    <span className="nav-arrowbox" aria-hidden="true">
                      <span className="ms">arrow_outward</span>
                    </span>
                  </span>
                  <span className="hws-card-body">{card.body}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="hws-visual" aria-hidden="true">
            {scene === "call" ? <CallScene faces={faces} /> : null}
            {scene === "inperson" ? <InPersonScene /> : null}
            {scene === "match" ? <MatchScene topics={topics} /> : null}
          </div>
        </div>
      </section>

      <section className="hws-sec" style={{ background: "#ffffff" }}>
        <div className="wrap hws-grid hws-flip">
          <div className="hws-visual" aria-hidden="true">
            <ContentArt />
          </div>
          <div className="hws-text">
            <h2 className="hws-h2">
              Expert content <span className="hws-badge lg">Coming soon</span>
            </h2>
            <p className="hws-lead">
              Expert knowledge you can read, hear and put to work, for when you need a wide view as well as one
              conversation.
            </p>
            <div className="hws-cards">
              {CONTENT_ITEMS.map((item) => (
                <SoonCard key={item.title} {...item} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="hws-sec" style={{ background: "#f6f6f4" }}>
        <div className="wrap hws-grid">
          <div className="hws-text">
            <h2 className="hws-h2">
              Events <span className="hws-badge lg">Coming soon</span>
            </h2>
            <p className="hws-lead">
              Bring experts and decision makers into the same room, in person or online, to learn from each other.
            </p>
            <div className="hws-cards">
              {EVENT_ITEMS.map((item) => (
                <SoonCard key={item.title} {...item} />
              ))}
            </div>
            <p className="hws-note">
              Want to host or join one?{" "}
              <Link href="/contact" className="lnk">
                Tell us
              </Link>
              .
            </p>
          </div>
          <div className="hws-visual" aria-hidden="true">
            <EventsArt faces={faces} />
          </div>
        </div>
      </section>
    </>
  );
}
