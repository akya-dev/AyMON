The rollouts. One directory per rollout, one directory per ring in it:

    rollout/r1/ring1/*.job + index.txt     (aysvc_index.py rollout/r1/ring1)
    rollout/r1/ring2/*.job + index.txt
    rollout/current.txt                    the rollout that runs: its name, one line

Writing a name into current.txt starts that rollout at ring 1. The centre
(main.tick in db/fleet.js, every 5 s) opens the next ring once every node
of the open one has reported each of its jobs DONE, and halts on a job
FAILED or REFUSED. Job files are signed elsewhere (aymon-lic job-sign);
the centre only reads their job= and targets= lines.

sample/rollout/demo is a two-ring rollout to try it with (unsigned jobs:
a node refuses them). See README.md.
