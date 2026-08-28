'use client';

import React from 'react';
import Link from 'next/link';
import { Badge, Panel } from '@/components/ds';
import { readProgress } from '@/lib/drillProgress';
import type { Lesson } from '@/lib/drills';

export interface LessonCardProps {
    lesson: Lesson;
    drillIds: readonly string[];
}

export default function LessonCard({ lesson, drillIds }: LessonCardProps) {
    // After mount, never during render: the server has no localStorage, and a
    // count read while rendering would not match what it sent.
    const [solved, setSolved] = React.useState(0);
    React.useEffect(() => {
        const done = new Set(readProgress().completed);
        setSolved(drillIds.filter((id) => done.has(id)).length);
    }, [drillIds]);

    const complete = drillIds.length > 0 && solved === drillIds.length;

    return (
        <Panel>
            <h2 className="text-pixel-sm font-bold m-0">
                <Link href={`/drills/${lesson.id}`}>{lesson.title}</Link>
            </h2>
            <p className="text-body-sm text-ink-muted mt-2 mb-0">{lesson.blurb}</p>
            <p className="text-pixel-2xs text-ink-muted mt-3 mb-0">
                {drillIds.length === 0
                    ? <span>Coming soon</span>
                    : complete
                        ? <Badge intent="success">Complete</Badge>
                        : <span>{solved} of {drillIds.length} solved</span>}
            </p>
        </Panel>
    );
}
